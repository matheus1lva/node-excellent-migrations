#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { analyzeDirectory, analyzeFile } from "./analyzer.js";
import {
  getConfigBaseDir,
  loadProjectConfig,
  resolveFromConfig,
} from "./config.js";
import { createMigration, initProject } from "./creator.js";
import { connect, disconnect } from "./db.js";
import { formatReport, hasErrors } from "./reporter.js";
import { migrate, rollback, status } from "./runner.js";
import {
  Config,
  DangerType,
  ProjectConfig,
} from "./types.js";

const COMMANDS = new Set([
  "check",
  "migrate",
  "rollback",
  "status",
  "create",
  "init",
]);

const USAGE = `
node-excellent-migrations - Database migration safety analyzer and runner

Usage:
  node-excellent-migrations <command> [argument] [options]

Commands:
  init                     Create a config file and migrations directory
  create <name>            Generate a new migration file
  check [path]             Analyze migration files for dangerous operations
  migrate [path]           Run all pending migrations (up)
  rollback [path]          Roll back the last applied migration (down)
  status [path]            Show applied and pending migrations

Options:
  --config <path>          Path to config file (default: auto-discover node-excellent-migrations.config.json)
  --database-url <url>     Database connection string (or set DATABASE_URL env)
  --table <name>           Migration tracking table (default: excellent_migrations)
  --schema <name>          Database schema (default: public)
  --extension <ext>        New migration extension: .mjs, .js, .cjs, or .ts
  --skip <types>           Comma-separated list of danger types to skip
  --start-after <name>     Only analyze migrations after this filename
  --error-on <types>       Comma-separated danger types to treat as errors
  --no-color               Disable colored output
  --json                   Output results as JSON
  --force                  Overwrite scaffold files for init

Danger types:
  column_removed, column_added_with_default, column_type_changed,
  column_renamed, table_renamed, table_dropped, not_null_added,
  json_column_added, index_not_concurrent, raw_sql_executed,
  foreign_key_added, check_constraint_added, unique_constraint_added,
  backfill_in_same_transaction, volatile_default

Config file:
  Create node-excellent-migrations.config.json to define project defaults:

    {
      "migrationsDir": "./migrations",
      "databaseUrl": "postgres://localhost/mydb",
      "tableName": "excellent_migrations",
      "schema": "public",
      "migrationExtension": ".mjs"
    }

Examples:
  node-excellent-migrations init
  node-excellent-migrations create add_users_table
  node-excellent-migrations check
  node-excellent-migrations migrate --database-url postgres://localhost/mydb
  node-excellent-migrations rollback ./db/migrations
  node-excellent-migrations status --json
`;

interface ParsedArgs {
  command: string;
  argument?: string;
  config: Partial<Config>;
  configPath?: string;
  noColor: boolean;
  json: boolean;
  force: boolean;
  databaseUrl?: string;
  tableName?: string;
  schema?: string;
  extension?: ProjectConfig["migrationExtension"];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command = "";
  let argument: string | undefined;
  const config: Partial<Config> = {};
  let configPath: string | undefined;
  let noColor = false;
  let json = false;
  let force = false;
  let databaseUrl: string | undefined;
  let tableName: string | undefined;
  let schema: string | undefined;
  let extension: ProjectConfig["migrationExtension"];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--config" && i + 1 < args.length) {
      configPath = args[++i];
    } else if (arg === "--skip" && i + 1 < args.length) {
      config.skipChecks = args[++i].split(",").map((s) => s.trim()) as DangerType[];
    } else if (arg === "--start-after" && i + 1 < args.length) {
      config.startAfter = args[++i];
    } else if (arg === "--error-on" && i + 1 < args.length) {
      const types = args[++i].split(",").map((s) => s.trim()) as DangerType[];
      config.severityOverrides = {};
      for (const t of types) {
        config.severityOverrides[t] = "error";
      }
    } else if (arg === "--database-url" && i + 1 < args.length) {
      databaseUrl = args[++i];
    } else if (arg === "--table" && i + 1 < args.length) {
      tableName = args[++i];
    } else if (arg === "--schema" && i + 1 < args.length) {
      schema = args[++i];
    } else if (arg === "--extension" && i + 1 < args.length) {
      const value = args[++i];
      if (![".js", ".mjs", ".cjs", ".ts"].includes(value)) {
        throw new Error(`Unsupported migration extension: ${value}`);
      }
      extension = value as ProjectConfig["migrationExtension"];
    } else if (arg === "--no-color") {
      noColor = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else if (!arg.startsWith("-") && !argument) {
      argument = arg;
    }
  }

  if (command && !COMMANDS.has(command)) {
    argument = command;
    command = "check";
  }

  return {
    command,
    argument,
    config,
    configPath,
    noColor,
    json,
    force,
    databaseUrl,
    tableName,
    schema,
    extension,
  };
}

function getMergedConfig(parsed: ParsedArgs): {
  configPath: string | null;
  baseDir: string;
  projectConfig: ProjectConfig;
} {
  const loaded = loadProjectConfig(parsed.configPath);
  const baseDir = getConfigBaseDir(loaded.path);

  return {
    configPath: loaded.path,
    baseDir,
    projectConfig: {
      ...loaded.config,
      ...parsed.config,
      ...(parsed.databaseUrl ? { databaseUrl: parsed.databaseUrl } : {}),
      ...(parsed.tableName ? { tableName: parsed.tableName } : {}),
      ...(parsed.schema ? { schema: parsed.schema } : {}),
      ...(parsed.extension ? { migrationExtension: parsed.extension } : {}),
    },
  };
}

function resolveTargetPath(argument: string | undefined, baseDir: string, projectConfig: ProjectConfig): string {
  if (argument) {
    return path.resolve(argument);
  }

  const migrationsDir = projectConfig.migrationsDir;
  if (!migrationsDir) {
    throw new Error("No migrations directory configured. Pass a path or run init.");
  }

  return resolveFromConfig(baseDir, migrationsDir);
}

async function runCheck(parsed: ParsedArgs): Promise<void> {
  const { baseDir, projectConfig } = getMergedConfig(parsed);
  const targetPath = resolveTargetPath(parsed.argument, baseDir, projectConfig);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(targetPath);
  const analysisConfig: Partial<Config> = {
    skipChecks: projectConfig.skipChecks,
    startAfter: projectConfig.startAfter,
    severityOverrides: projectConfig.severityOverrides,
  };
  const results = stat.isDirectory()
    ? analyzeDirectory(targetPath, analysisConfig)
    : [analyzeFile(targetPath, analysisConfig)].filter((r) => r.dangers.length > 0);

  if (parsed.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatReport(results, { colors: !parsed.noColor, config: analysisConfig }));
  }

  if (hasErrors(results, analysisConfig)) {
    process.exit(1);
  }
  if (results.some((r) => r.dangers.length > 0)) {
    process.exit(2);
  }
}

async function runMigrate(parsed: ParsedArgs): Promise<void> {
  const { baseDir, projectConfig } = getMergedConfig(parsed);
  const migrationsDir = resolveTargetPath(parsed.argument, baseDir, projectConfig);

  if (!fs.existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  connect(projectConfig.databaseUrl);

  try {
    const result = await migrate({
      migrationsDir,
      tableName: projectConfig.tableName,
      schema: projectConfig.schema,
    });

    if (result.applied.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`Applied ${result.applied.length} migration(s):`);
    for (const name of result.applied) {
      console.log(`  + ${name}`);
    }
  } finally {
    await disconnect();
  }
}

async function runRollback(parsed: ParsedArgs): Promise<void> {
  const { baseDir, projectConfig } = getMergedConfig(parsed);
  const migrationsDir = resolveTargetPath(parsed.argument, baseDir, projectConfig);

  if (!fs.existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  connect(projectConfig.databaseUrl);

  try {
    const result = await rollback({
      migrationsDir,
      tableName: projectConfig.tableName,
      schema: projectConfig.schema,
    });

    if (result.rolledBack) {
      console.log(`Rolled back: ${result.rolledBack}`);
    } else {
      console.log("Nothing to roll back.");
    }
  } finally {
    await disconnect();
  }
}

async function runStatus(parsed: ParsedArgs): Promise<void> {
  const { baseDir, projectConfig } = getMergedConfig(parsed);
  const migrationsDir = resolveTargetPath(parsed.argument, baseDir, projectConfig);

  if (!fs.existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  connect(projectConfig.databaseUrl);

  try {
    const result = await status({
      migrationsDir,
      tableName: projectConfig.tableName,
      schema: projectConfig.schema,
    });

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.applied.length > 0) {
      console.log("Applied:");
      for (const name of result.applied) {
        console.log(`  + ${name}`);
      }
    }
    if (result.pending.length > 0) {
      console.log("Pending:");
      for (const name of result.pending) {
        console.log(`  - ${name}`);
      }
    }
    if (result.applied.length === 0 && result.pending.length === 0) {
      console.log("No migrations found.");
    }
  } finally {
    await disconnect();
  }
}

function runCreate(parsed: ParsedArgs): void {
  if (!parsed.argument) {
    throw new Error("Please provide a migration name.");
  }

  const { baseDir, projectConfig } = getMergedConfig(parsed);
  const migrationsDir = resolveTargetPath(undefined, baseDir, projectConfig);
  const result = createMigration({
    migrationsDir,
    name: parsed.argument,
    extension: projectConfig.migrationExtension,
  });

  console.log(`Created migration: ${result.filePath}`);
}

function runInit(parsed: ParsedArgs): void {
  const cwd = process.cwd();
  const result = initProject({
    cwd,
    force: parsed.force,
    config: parsed.extension
      ? { migrationExtension: parsed.extension }
      : undefined,
  });

  console.log(`Created config: ${result.configPath}`);
  console.log(`Ensured migrations directory: ${result.migrationsDir}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed.command) {
    console.error("Error: Please provide a command.");
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  switch (parsed.command) {
    case "init":
      runInit(parsed);
      break;
    case "create":
      runCreate(parsed);
      break;
    case "check":
      await runCheck(parsed);
      break;
    case "migrate":
      await runMigrate(parsed);
      break;
    case "rollback":
      await runRollback(parsed);
      break;
    case "status":
      await runStatus(parsed);
      break;
    default:
      console.error(`Unknown command: ${parsed.command}`);
      console.error("Run with --help for usage information.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

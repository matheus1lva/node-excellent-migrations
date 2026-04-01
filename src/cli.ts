#!/usr/bin/env node

import * as path from "path";
import * as fs from "fs";
import { analyzeFile, analyzeDirectory } from "./analyzer.js";
import { formatReport, hasErrors } from "./reporter.js";
import { Config, DangerType } from "./types.js";
import { connect, disconnect } from "./db.js";
import { migrate, rollback, status } from "./runner.js";

const USAGE = `
node-excellent-migrations - Database migration safety analyzer and runner

Usage:
  node-excellent-migrations <command> [options]

Commands:
  check <path>              Analyze migration files for dangerous operations
  migrate <path>            Run all pending migrations (up)
  rollback <path>           Roll back the last applied migration (down)
  status <path>             Show applied and pending migrations

Options (check):
  --skip <types>            Comma-separated list of danger types to skip
  --start-after <name>      Only analyze migrations after this filename
  --error-on <types>        Comma-separated danger types to treat as errors
  --no-color                Disable colored output
  --json                    Output results as JSON

Options (migrate/rollback/status):
  --database-url <url>      Database connection string (or set DATABASE_URL env)
  --table <name>            Migration tracking table (default: excellent_migrations)
  --schema <name>           Database schema (default: public)

Danger types:
  column_removed, column_added_with_default, column_type_changed,
  column_renamed, table_renamed, table_dropped, not_null_added,
  json_column_added, index_not_concurrent, raw_sql_executed,
  foreign_key_added, check_constraint_added, unique_constraint_added,
  backfill_in_same_transaction, volatile_default

Safety assurance comments (add to migration files to suppress specific warnings):
  // excellent-migrations:safety-assured-for-next-line <danger_type>
  // excellent-migrations:safety-assured-for-this-file <danger_type>
  -- excellent-migrations:safety-assured-for-next-line <danger_type>   (SQL)
  -- excellent-migrations:safety-assured-for-this-file <danger_type>   (SQL)

Migration file format:
  Each migration file must export 'up' and 'down' functions:

    exports.up = async (client) => {
      await client.query('CREATE TABLE users (id serial PRIMARY KEY)');
    };

    exports.down = async (client) => {
      await client.query('DROP TABLE users');
    };

Examples:
  node-excellent-migrations check ./migrations
  node-excellent-migrations check ./migrations --skip raw_sql_executed --json
  node-excellent-migrations migrate ./migrations
  node-excellent-migrations migrate ./migrations --database-url postgres://localhost/mydb
  node-excellent-migrations rollback ./migrations
  node-excellent-migrations status ./migrations
`;

interface ParsedArgs {
  command: string;
  targetPath: string;
  config: Partial<Config>;
  noColor: boolean;
  json: boolean;
  databaseUrl?: string;
  tableName?: string;
  schema?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command = "";
  let targetPath = "";
  const config: Partial<Config> = {};
  let noColor = false;
  let json = false;
  let databaseUrl: string | undefined;
  let tableName: string | undefined;
  let schema: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
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
    } else if (arg === "--no-color") {
      noColor = true;
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  // Backwards compat: if no command given, treat path as check target
  if (!command && !targetPath) {
    // No arguments
  } else if (command && !targetPath && !["check", "migrate", "rollback", "status"].includes(command)) {
    // Single argument that isn't a command — treat as `check <path>`
    targetPath = command;
    command = "check";
  }

  return { command, targetPath, config, noColor, json, databaseUrl, tableName, schema };
}

async function runCheck(parsed: ParsedArgs): Promise<void> {
  const { targetPath, config, noColor, json } = parsed;

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: Path not found: ${resolved}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolved);
  const results = stat.isDirectory()
    ? analyzeDirectory(resolved, config)
    : [analyzeFile(resolved, config)].filter((r) => r.dangers.length > 0);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatReport(results, { colors: !noColor, config }));
  }

  if (hasErrors(results, config)) {
    process.exit(1);
  }
  if (results.some((r) => r.dangers.length > 0)) {
    process.exit(2);
  }
}

async function runMigrate(parsed: ParsedArgs): Promise<void> {
  const resolved = path.resolve(parsed.targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: Migrations directory not found: ${resolved}`);
    process.exit(1);
  }

  connect(parsed.databaseUrl);

  try {
    const result = await migrate({
      migrationsDir: resolved,
      tableName: parsed.tableName,
      schema: parsed.schema,
    });

    if (result.applied.length === 0) {
      console.log("No pending migrations.");
    } else {
      console.log(`Applied ${result.applied.length} migration(s):`);
      for (const name of result.applied) {
        console.log(`  + ${name}`);
      }
    }
  } finally {
    await disconnect();
  }
}

async function runRollback(parsed: ParsedArgs): Promise<void> {
  const resolved = path.resolve(parsed.targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: Migrations directory not found: ${resolved}`);
    process.exit(1);
  }

  connect(parsed.databaseUrl);

  try {
    const result = await rollback({
      migrationsDir: resolved,
      tableName: parsed.tableName,
      schema: parsed.schema,
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
  const resolved = path.resolve(parsed.targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: Migrations directory not found: ${resolved}`);
    process.exit(1);
  }

  connect(parsed.databaseUrl);

  try {
    const result = await status({
      migrationsDir: resolved,
      tableName: parsed.tableName,
      schema: parsed.schema,
    });

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
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
    }
  } finally {
    await disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed.command || !parsed.targetPath) {
    console.error("Error: Please provide a command and path.");
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  switch (parsed.command) {
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

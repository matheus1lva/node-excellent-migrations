#!/usr/bin/env node

import * as path from "path";
import * as fs from "fs";
import { analyzeFile, analyzeDirectory } from "./analyzer";
import { formatReport, hasErrors } from "./reporter";
import { Config, DangerType } from "./types";

const USAGE = `
node-excellent-migrations - Detect dangerous operations in database migrations

Usage:
  node-excellent-migrations <path> [options]

Arguments:
  <path>                    File or directory to analyze

Options:
  --skip <types>            Comma-separated list of danger types to skip
  --start-after <name>      Only analyze migrations after this filename
  --error-on <types>        Comma-separated danger types to treat as errors
  --no-color                Disable colored output
  --json                    Output results as JSON
  --help                    Show this help message

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

Examples:
  node-excellent-migrations ./migrations
  node-excellent-migrations ./migrations/001_add_users.sql
  node-excellent-migrations ./migrations --skip raw_sql_executed,index_not_concurrent
  node-excellent-migrations ./migrations --error-on column_removed,table_dropped
  node-excellent-migrations ./migrations --json
`;

function parseArgs(argv: string[]): {
  targetPath: string;
  config: Partial<Config>;
  noColor: boolean;
  json: boolean;
} {
  const args = argv.slice(2);
  let targetPath = "";
  const config: Partial<Config> = {};
  let noColor = false;
  let json = false;

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
    } else if (arg === "--no-color") {
      noColor = true;
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  return { targetPath, config, noColor, json };
}

function main(): void {
  const { targetPath, config, noColor, json } = parseArgs(process.argv);

  if (!targetPath) {
    console.error("Error: Please provide a file or directory path.");
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

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

  // Exit with code 1 if there are errors
  if (hasErrors(results, config)) {
    process.exit(1);
  }

  // Exit with code 2 if there are any warnings (useful for CI)
  if (results.some((r) => r.dangers.length > 0)) {
    process.exit(2);
  }
}

main();

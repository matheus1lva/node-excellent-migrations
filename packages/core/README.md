# node-excellent-migrations

CLI and analyzer that detects dangerous operations in database migrations — and a small runner that executes the safe ones.

## Install

```bash
npm install --save-dev node-excellent-migrations
```

## Quick start

```bash
npx node-excellent-migrations init
npx node-excellent-migrations create add_users_table
npx node-excellent-migrations check
npx node-excellent-migrations migrate   --database-url postgres://localhost/mydb
npx node-excellent-migrations status
npx node-excellent-migrations rollback
```

## Commands

```
node-excellent-migrations <command> [argument] [options]

  init                     Create a config file and migrations directory
  create <name>            Generate a new migration file
  check  [path]            Analyze migration files for dangerous operations
  migrate  [path]          Run all pending migrations (up)
  rollback [path]          Roll back the last applied migration (down)
  status   [path]          Show applied and pending migrations
```

Common options: `--config`, `--database-url`, `--table`, `--schema`, `--extension`, `--skip`, `--start-after`, `--error-on`, `--json`, `--no-color`.

Run `node-excellent-migrations --help` for the full list.

## Configuration

`node-excellent-migrations.config.json` at the project root:

```json
{
  "migrationsDir": "./migrations",
  "databaseUrl": "postgres://localhost/mydb",
  "tableName": "excellent_migrations",
  "schema": "public",
  "migrationExtension": ".mjs",
  "skipChecks": [],
  "severityOverrides": {
    "raw_sql_executed": "error"
  }
}
```

`databaseUrl` is also read from the `DATABASE_URL` environment variable.

## Detected dangers

`column_removed`, `column_added_with_default`, `column_type_changed`, `column_renamed`, `table_renamed`, `table_dropped`, `not_null_added`, `json_column_added`, `index_not_concurrent`, `raw_sql_executed`, `foreign_key_added`, `check_constraint_added`, `unique_constraint_added`, `backfill_in_same_transaction`, `volatile_default`.

## Suppressing warnings

For a single line:

```ts
// excellent-migrations:safety-assured-for-next-line index_not_concurrent
await client.query("CREATE INDEX users_email_idx ON users(email)");
```

For an entire file:

```ts
// excellent-migrations:safety-assured-for-this-file raw_sql_executed
```

Both forms also work as `--` SQL comments.

## Programmatic API

```ts
import {
  analyzeFile,
  analyzeDirectory,
  formatReport,
  migrate,
  rollback,
  status,
  connect,
  disconnect,
  type Migration,
} from "node-excellent-migrations";

const results = analyzeDirectory("./migrations");
console.log(formatReport(results));

connect(process.env.DATABASE_URL);
await migrate({ migrationsDir: "./migrations" });
await disconnect();
```

Each migration file exports `up` and `down`:

```ts
import type { Migration } from "node-excellent-migrations";

export const up: Migration["up"] = async (client) => {
  await client.query("CREATE TABLE users (id serial PRIMARY KEY, name text)");
};

export const down: Migration["down"] = async (client) => {
  await client.query("DROP TABLE users");
};
```

## See also

- [`eslint-plugin-node-excellent-migrations`](https://www.npmjs.com/package/eslint-plugin-node-excellent-migrations) — the same checks, exposed as ESLint rules.

## License

MIT

# node-excellent-migrations

Catch dangerous database migrations *before* they reach production, then run the safe ones with a small, scriptable runner.

This monorepo ships two packages:

| Package | Description |
| --- | --- |
| [`node-excellent-migrations`](./packages/core) | The CLI, analyzer, and migration runner. |
| [`eslint-plugin-node-excellent-migrations`](./packages/eslint-plugin) | ESLint rules powered by the same analyzer. |

## Why

Most migration tools happily let you ship a query that locks a 50M-row table for ten minutes. This one does not. It analyzes migration files for the operations that are known to cause incidents — full table rewrites, blocking index builds, removed/renamed columns that running app instances still reference, raw SQL with no safe alternative — and either fails CI, your editor, or the runner before they go out.

When the analyzer is wrong, you can suppress a specific danger inline:

```ts
// excellent-migrations:safety-assured-for-next-line column_removed
await client.query("ALTER TABLE users DROP COLUMN legacy_id");
```

## Detected dangers

`column_removed`, `column_added_with_default`, `column_type_changed`, `column_renamed`, `table_renamed`, `table_dropped`, `not_null_added`, `json_column_added`, `index_not_concurrent`, `raw_sql_executed`, `foreign_key_added`, `check_constraint_added`, `unique_constraint_added`, `backfill_in_same_transaction`, `volatile_default`.

Each danger has a human-readable explanation and, where it makes sense, a suggested safe rewrite (e.g. `CREATE INDEX` → `CREATE INDEX CONCURRENTLY`, `ADD COLUMN ... DEFAULT` → split into add-without-default, backfill, then set default).

## Quick start

Install the CLI in your project:

```bash
npm install --save-dev node-excellent-migrations
```

Scaffold a config and migrations directory:

```bash
npx node-excellent-migrations init
```

Create, check, and run migrations:

```bash
npx node-excellent-migrations create add_users_table
npx node-excellent-migrations check
npx node-excellent-migrations migrate   --database-url postgres://localhost/mydb
npx node-excellent-migrations status
npx node-excellent-migrations rollback
```

Or wire it into ESLint:

```bash
npm install --save-dev eslint-plugin-node-excellent-migrations
```

```js
// eslint.config.js
import migrations from "eslint-plugin-node-excellent-migrations";

export default [
  {
    files: ["migrations/**/*.{js,ts,mjs,cjs}"],
    plugins: { "node-excellent-migrations": migrations },
    rules: {
      "node-excellent-migrations/no-dangerous-migration": "error",
    },
  },
];
```

## CLI

```
node-excellent-migrations <command> [argument] [options]

Commands:
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

Create `node-excellent-migrations.config.json` at the root of your project:

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
} from "node-excellent-migrations";

const results = analyzeDirectory("./migrations");
console.log(formatReport(results));

connect(process.env.DATABASE_URL);
await migrate({ migrationsDir: "./migrations" });
await disconnect();
```

The runner expects each migration file to export `up` and `down` functions:

```ts
import type { Migration } from "node-excellent-migrations";

export const up: Migration["up"] = async (client) => {
  await client.query("CREATE TABLE users (id serial PRIMARY KEY, name text)");
};

export const down: Migration["down"] = async (client) => {
  await client.query("DROP TABLE users");
};
```

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

Both forms work in `--` SQL comments too.

## Repository layout

```
packages/
  core/             node-excellent-migrations  (CLI + analyzer + runner)
  eslint-plugin/    eslint-plugin-node-excellent-migrations
```

## Development

Requires Node.js 18+ and [Bun](https://bun.sh) (used for the workspace install and the published lockfile).

```bash
bun install
bun run build
bun run test
bun run lint
```

Releases are cut by publishing a GitHub release; the `publish.yml` workflow builds, tests, and publishes both packages to npm.

## License

MIT

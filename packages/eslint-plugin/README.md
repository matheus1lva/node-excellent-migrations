# eslint-plugin-node-excellent-migrations

ESLint rules for catching dangerous database migration patterns using the `node-excellent-migrations` analyzer.

## What it provides

- `node-excellent-migrations/no-dangerous-migration`
- Per-danger rules such as:
  - `node-excellent-migrations/no-column_removed`
  - `node-excellent-migrations/no-raw_sql_executed`
  - `node-excellent-migrations/no-index_not_concurrent`

The plugin analyzes migration source code and reports the same danger types exposed by the core package.

## Install

```bash
npm install --save-dev eslint eslint-plugin-node-excellent-migrations node-excellent-migrations
```

## Usage

### Flat config

```js
import migrationsPlugin from "eslint-plugin-node-excellent-migrations";

export default [
  {
    files: ["migrations/**/*.{js,ts,mjs,cjs}"],
    plugins: {
      "node-excellent-migrations": migrationsPlugin,
    },
    rules: {
      "node-excellent-migrations/no-dangerous-migration": "error",
    },
  },
];
```

### Legacy config

```json
{
  "plugins": ["node-excellent-migrations"],
  "extends": ["plugin:node-excellent-migrations/recommended"]
}
```

## Rule options

The aggregate rule accepts the same high-level filtering controls as the core analyzer:

```js
{
  "node-excellent-migrations/no-dangerous-migration": ["error", {
    skipChecks: ["raw_sql_executed"],
    errorOn: ["column_removed", "table_dropped"],
    startAfter: "20260401000000"
  }]
}
```

## Available danger types

- `column_removed`
- `column_added_with_default`
- `column_type_changed`
- `column_renamed`
- `table_renamed`
- `table_dropped`
- `not_null_added`
- `json_column_added`
- `index_not_concurrent`
- `raw_sql_executed`
- `foreign_key_added`
- `check_constraint_added`
- `unique_constraint_added`
- `backfill_in_same_transaction`
- `volatile_default`

Each danger type is also exposed as a dedicated rule named `no-<danger_type>`.

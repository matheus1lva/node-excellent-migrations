import * as fs from "fs";
import * as path from "path";
import { Pool, PoolClient } from "pg";
import { getPool } from "./db.js";
import { Migration, MigrationClient, MigrationRecord, RunnerConfig } from "./types.js";

const DEFAULT_TABLE = "excellent_migrations";
const DEFAULT_SCHEMA = "public";

/**
 * Ensures the migrations tracking table exists.
 */
async function ensureMigrationsTable(
  pool: Pool,
  tableName: string,
  schema: string
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"."${tableName}" (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      migrated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Returns all previously applied migrations, ordered by name.
 */
export async function getAppliedMigrations(
  config?: Partial<RunnerConfig>,
  pool?: Pool
): Promise<MigrationRecord[]> {
  const db = pool ?? getPool();
  const tableName = config?.tableName ?? DEFAULT_TABLE;
  const schema = config?.schema ?? DEFAULT_SCHEMA;

  await ensureMigrationsTable(db, tableName, schema);

  const result = await db.query(
    `SELECT id, name, migrated_at FROM "${schema}"."${tableName}" ORDER BY name ASC`
  );
  return result.rows.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    name: r.name as string,
    migratedAt: r.migrated_at as Date,
  }));
}

/**
 * Lists all migration files in the directory, sorted by filename.
 */
function listMigrationFiles(dir: string): string[] {
  const validExtensions = new Set([".js", ".ts", ".mjs", ".cjs"]);
  return fs
    .readdirSync(dir)
    .filter((f) => validExtensions.has(path.extname(f).toLowerCase()))
    .sort();
}

/**
 * Loads a migration module. Expects the file to export `up` and `down` functions.
 */
async function loadMigration(filePath: string): Promise<Migration> {
  const fileUrl = new URL(`file://${path.resolve(filePath)}`);
  const mod = await import(fileUrl.href);

  if (typeof mod.up !== "function") {
    throw new Error(`Migration ${filePath} does not export an 'up' function.`);
  }
  if (typeof mod.down !== "function") {
    throw new Error(`Migration ${filePath} does not export a 'down' function.`);
  }

  return { up: mod.up, down: mod.down };
}

/**
 * Creates a MigrationClient wrapper around a pg PoolClient.
 */
function wrapClient(client: PoolClient): MigrationClient {
  return {
    async query(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params);
      return { rows: result.rows };
    },
  };
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

/**
 * Runs all pending migrations (up).
 * Each migration runs in its own transaction.
 */
export async function migrate(config: RunnerConfig, pool?: Pool): Promise<MigrateResult> {
  const db = pool ?? getPool();
  const tableName = config.tableName ?? DEFAULT_TABLE;
  const schema = config.schema ?? DEFAULT_SCHEMA;

  await ensureMigrationsTable(db, tableName, schema);

  const applied = await getAppliedMigrations(config, db);
  const appliedNames = new Set(applied.map((m) => m.name));
  const files = listMigrationFiles(config.migrationsDir);

  const result: MigrateResult = { applied: [], skipped: [] };

  for (const file of files) {
    const name = file;
    if (appliedNames.has(name)) {
      result.skipped.push(name);
      continue;
    }

    const filePath = path.resolve(config.migrationsDir, file);
    const migration = await loadMigration(filePath);

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await migration.up(wrapClient(client));
      await client.query(
        `INSERT INTO "${schema}"."${tableName}" (name) VALUES ($1)`,
        [name]
      );
      await client.query("COMMIT");
      result.applied.push(name);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(
        `Migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      client.release();
    }
  }

  return result;
}

export interface RollbackResult {
  rolledBack: string | null;
}

/**
 * Rolls back the last applied migration (down).
 * Runs in a transaction.
 */
export async function rollback(config: RunnerConfig, pool?: Pool): Promise<RollbackResult> {
  const db = pool ?? getPool();
  const tableName = config.tableName ?? DEFAULT_TABLE;
  const schema = config.schema ?? DEFAULT_SCHEMA;

  await ensureMigrationsTable(db, tableName, schema);

  const applied = await getAppliedMigrations(config, db);
  if (applied.length === 0) {
    return { rolledBack: null };
  }

  const last = applied[applied.length - 1];
  const filePath = path.resolve(config.migrationsDir, last.name);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Migration file not found for rollback: ${last.name}. Cannot run down().`
    );
  }

  const migration = await loadMigration(filePath);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await migration.down(wrapClient(client));
    await client.query(
      `DELETE FROM "${schema}"."${tableName}" WHERE name = $1`,
      [last.name]
    );
    await client.query("COMMIT");
    return { rolledBack: last.name };
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(
      `Rollback of ${last.name} failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    client.release();
  }
}

/**
 * Returns the status of all migrations: which are applied and which are pending.
 */
export async function status(
  config: RunnerConfig,
  pool?: Pool
): Promise<{ applied: string[]; pending: string[] }> {
  const db = pool ?? getPool();

  const applied = await getAppliedMigrations(config, db);
  const appliedNames = new Set(applied.map((m) => m.name));
  const files = listMigrationFiles(config.migrationsDir);

  const pending = files.filter((f) => !appliedNames.has(f));

  return {
    applied: applied.map((m) => m.name),
    pending,
  };
}

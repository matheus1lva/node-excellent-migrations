import { Pool, PoolConfig } from "pg";

let pool: Pool | null = null;

/**
 * Creates a connection pool from DATABASE_URL or explicit config.
 * Call this once at startup; reuses the pool for subsequent calls.
 */
export function connect(urlOrConfig?: string | PoolConfig): Pool {
  if (pool) return pool;

  const databaseUrl = typeof urlOrConfig === "string"
    ? urlOrConfig
    : urlOrConfig
      ? undefined
      : process.env.DATABASE_URL;

  if (databaseUrl) {
    pool = new Pool({ connectionString: databaseUrl });
  } else if (typeof urlOrConfig === "object") {
    pool = new Pool(urlOrConfig);
  } else {
    throw new Error(
      "No database connection configured. Set DATABASE_URL environment variable or pass a connection string."
    );
  }

  return pool;
}

/**
 * Returns the current pool, or throws if not connected.
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error("Not connected to database. Call connect() first.");
  }
  return pool;
}

/**
 * Disconnects the pool and cleans up.
 */
export async function disconnect(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Resets the module state (for testing).
 */
export function _resetPool(): void {
  pool = null;
}

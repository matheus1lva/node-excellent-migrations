import { Pool } from "pg";
import { getPool } from "./db";

export interface TableInfo {
  tableName: string;
  schema: string;
}

export interface ColumnInfo {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  schema: string;
}

export interface IndexInfo {
  indexName: string;
  tableName: string;
  isUnique: boolean;
  columns: string[];
  schema: string;
}

export interface ConstraintInfo {
  constraintName: string;
  tableName: string;
  constraintType: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  schema: string;
}

export interface SchemaSnapshot {
  tables: TableInfo[];
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  constraints: ConstraintInfo[];
}

/**
 * Introspects the current database schema for a given schema name (default: "public").
 */
export async function inspectSchema(
  schemaName: string = "public",
  pool?: Pool
): Promise<SchemaSnapshot> {
  const db = pool ?? getPool();

  const [tables, columns, indexes, constraints] = await Promise.all([
    queryTables(db, schemaName),
    queryColumns(db, schemaName),
    queryIndexes(db, schemaName),
    queryConstraints(db, schemaName),
  ]);

  return { tables, columns, indexes, constraints };
}

async function queryTables(db: Pool, schema: string): Promise<TableInfo[]> {
  const result = await db.query(
    `SELECT table_name, table_schema
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  );
  return result.rows.map((r) => ({
    tableName: r.table_name,
    schema: r.table_schema,
  }));
}

async function queryColumns(db: Pool, schema: string): Promise<ColumnInfo[]> {
  const result = await db.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, table_schema
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [schema]
  );
  return result.rows.map((r) => ({
    tableName: r.table_name,
    columnName: r.column_name,
    dataType: r.data_type,
    isNullable: r.is_nullable === "YES",
    columnDefault: r.column_default,
    schema: r.table_schema,
  }));
}

async function queryIndexes(db: Pool, schema: string): Promise<IndexInfo[]> {
  const result = await db.query(
    `SELECT
       i.relname AS index_name,
       t.relname AS table_name,
       ix.indisunique AS is_unique,
       n.nspname AS schema_name,
       array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns
     FROM pg_index ix
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
     WHERE n.nspname = $1
     GROUP BY i.relname, t.relname, ix.indisunique, n.nspname
     ORDER BY t.relname, i.relname`,
    [schema]
  );
  return result.rows.map((r) => ({
    indexName: r.index_name,
    tableName: r.table_name,
    isUnique: r.is_unique,
    columns: r.columns,
    schema: r.schema_name,
  }));
}

async function queryConstraints(
  db: Pool,
  schema: string
): Promise<ConstraintInfo[]> {
  const result = await db.query(
    `SELECT
       tc.constraint_name,
       tc.table_name,
       tc.constraint_type,
       tc.table_schema
     FROM information_schema.table_constraints tc
     WHERE tc.table_schema = $1
     ORDER BY tc.table_name, tc.constraint_name`,
    [schema]
  );
  return result.rows.map((r) => ({
    constraintName: r.constraint_name,
    tableName: r.table_name,
    constraintType: r.constraint_type,
    schema: r.table_schema,
  }));
}

/**
 * Gets the approximate row count for a table (fast, uses pg_class stats).
 */
export async function getApproxRowCount(
  tableName: string,
  schemaName: string = "public",
  pool?: Pool
): Promise<number> {
  const db = pool ?? getPool();
  const result = await db.query(
    `SELECT reltuples::bigint AS estimate
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = $1 AND n.nspname = $2`,
    [tableName, schemaName]
  );
  return result.rows[0]?.estimate ?? 0;
}

/**
 * Checks if a table exists in the database.
 */
export async function tableExists(
  tableName: string,
  schemaName: string = "public",
  pool?: Pool
): Promise<boolean> {
  const db = pool ?? getPool();
  const result = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2`,
    [schemaName, tableName]
  );
  return result.rows.length > 0;
}

/**
 * Checks if a column exists on a table.
 */
export async function columnExists(
  tableName: string,
  columnName: string,
  schemaName: string = "public",
  pool?: Pool
): Promise<boolean> {
  const db = pool ?? getPool();
  const result = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schemaName, tableName, columnName]
  );
  return result.rows.length > 0;
}

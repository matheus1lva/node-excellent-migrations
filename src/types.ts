/**
 * All danger types that can be detected in migration files.
 */
export enum DangerType {
  /** Removing a column causes errors in running application instances that still reference it */
  COLUMN_REMOVED = "column_removed",
  /** Adding a column with a default value causes a full table rewrite, blocking reads/writes */
  COLUMN_ADDED_WITH_DEFAULT = "column_added_with_default",
  /** Changing a column type causes a full table rewrite, blocking reads/writes */
  COLUMN_TYPE_CHANGED = "column_type_changed",
  /** Renaming a column breaks running application instances that reference the old name */
  COLUMN_RENAMED = "column_renamed",
  /** Renaming a table breaks running application instances that reference the old name */
  TABLE_RENAMED = "table_renamed",
  /** Dropping a table removes all data permanently */
  TABLE_DROPPED = "table_dropped",
  /** Adding a NOT NULL constraint requires a full table scan, blocking access */
  NOT_NULL_ADDED = "not_null_added",
  /** Using json instead of jsonb in Postgres lacks indexing and equality operators */
  JSON_COLUMN_ADDED = "json_column_added",
  /** Creating an index without CONCURRENTLY blocks reads/writes on the table */
  INDEX_NOT_CONCURRENT = "index_not_concurrent",
  /** Raw SQL cannot be automatically analyzed for safety */
  RAW_SQL_EXECUTED = "raw_sql_executed",
  /** Adding a foreign key constraint blocks writes on both tables */
  FOREIGN_KEY_ADDED = "foreign_key_added",
  /** Adding a check constraint blocks reads/writes while validating existing rows */
  CHECK_CONSTRAINT_ADDED = "check_constraint_added",
  /** Adding a unique constraint blocks reads/writes */
  UNIQUE_CONSTRAINT_ADDED = "unique_constraint_added",
  /** Backfilling data in the same transaction as schema changes holds locks longer */
  BACKFILL_IN_SAME_TRANSACTION = "backfill_in_same_transaction",
  /** Using volatile default values (e.g. uuid_generate_v4()) forces row-by-row updates */
  VOLATILE_DEFAULT = "volatile_default",
}

export interface Danger {
  /** The type of danger detected */
  type: DangerType;
  /** Human-readable description of the danger and how to fix it */
  message: string;
  /** Line number in the migration file (1-based), if available */
  line?: number;
  /** The raw code/SQL snippet that triggered the detection */
  snippet?: string;
}

export interface AnalysisResult {
  /** Path to the migration file that was analyzed */
  filePath: string;
  /** List of dangers detected */
  dangers: Danger[];
}

export type DangerSeverity = "warning" | "error";

export interface Config {
  /** Danger types to skip during analysis */
  skipChecks: DangerType[];
  /** Only analyze migrations created after this timestamp/filename prefix */
  startAfter?: string;
  /** Map of danger types to severity levels (default: all "warning") */
  severityOverrides: Partial<Record<DangerType, DangerSeverity>>;
}

export const DEFAULT_CONFIG: Config = {
  skipChecks: [],
  severityOverrides: {},
};

/**
 * Safety assurance comment patterns that suppress warnings.
 * Use in migration files:
 *   // excellent-migrations:safety-assured-for-next-line column_removed
 *   // excellent-migrations:safety-assured-for-this-file column_removed
 */
export const SAFETY_ASSURED_NEXT_LINE =
  /excellent-migrations:safety-assured-for-next-line\s+(\S+)/;
export const SAFETY_ASSURED_FILE =
  /excellent-migrations:safety-assured-for-this-file\s+(\S+)/;

export const DANGER_MESSAGES: Record<DangerType, string> = {
  [DangerType.COLUMN_REMOVED]:
    "Removing a column may cause errors in running application instances that still reference it. Deploy code changes first, then remove the column in a separate migration.",
  [DangerType.COLUMN_ADDED_WITH_DEFAULT]:
    "Adding a column with a default value causes a full table rewrite on older databases, blocking reads and writes. Add the column without a default, then set the default in a separate step.",
  [DangerType.COLUMN_TYPE_CHANGED]:
    "Changing a column type causes a full table rewrite, blocking reads and writes. Consider adding a new column, copying data, then removing the old column.",
  [DangerType.COLUMN_RENAMED]:
    "Renaming a column breaks running application instances that reference the old name. Consider adding a new column, copying data, and dropping the old column.",
  [DangerType.TABLE_RENAMED]:
    "Renaming a table breaks running application instances that reference the old name. Consider creating a new table, copying data, and dropping the old table.",
  [DangerType.TABLE_DROPPED]:
    "Dropping a table removes all data permanently. Ensure the table is no longer referenced by any application code.",
  [DangerType.NOT_NULL_ADDED]:
    "Adding a NOT NULL constraint requires a full table scan to validate existing rows, blocking reads and writes. Add a CHECK constraint first with NOT VALID, then validate it separately.",
  [DangerType.JSON_COLUMN_ADDED]:
    "Using json column type instead of jsonb lacks indexing support and equality operators. Prefer jsonb unless you need to preserve key ordering.",
  [DangerType.INDEX_NOT_CONCURRENT]:
    "Creating an index without CONCURRENTLY blocks reads and writes on the table. Use CREATE INDEX CONCURRENTLY to avoid downtime.",
  [DangerType.RAW_SQL_EXECUTED]:
    "Raw SQL cannot be automatically analyzed for safety. Review it manually to ensure it does not contain dangerous operations.",
  [DangerType.FOREIGN_KEY_ADDED]:
    "Adding a foreign key constraint blocks writes on both tables while validating existing rows. Add the constraint with NOT VALID first, then validate it separately.",
  [DangerType.CHECK_CONSTRAINT_ADDED]:
    "Adding a check constraint blocks reads and writes while validating existing rows. Add the constraint with NOT VALID first, then validate it separately.",
  [DangerType.UNIQUE_CONSTRAINT_ADDED]:
    "Adding a unique constraint blocks reads and writes. Consider creating a unique index concurrently instead.",
  [DangerType.BACKFILL_IN_SAME_TRANSACTION]:
    "Backfilling data in the same transaction as schema changes holds locks for the duration. Run data migrations in a separate migration or use batched updates.",
  [DangerType.VOLATILE_DEFAULT]:
    "Using volatile default values (e.g. uuid_generate_v4(), clock_timestamp()) forces row-by-row updates instead of a fast metadata-only change.",
};

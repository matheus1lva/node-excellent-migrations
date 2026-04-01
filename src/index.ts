// Public API — Analysis
export { analyzeFile, analyzeSource, analyzeDirectory } from "./analyzer";
export { formatReport, hasErrors } from "./reporter";
export { filterAssuredDangers } from "./safety-comments";
export { detectSqlDangers, detectBackfillDanger, detectAstDangers, enhanceDangersWithSchema } from "./detectors";

// Public API — Database
export { connect, disconnect, getPool } from "./db";
export { inspectSchema, getApproxRowCount, tableExists, columnExists } from "./schema-inspector";

// Public API — Migration Runner
export { migrate, rollback, status, getAppliedMigrations } from "./runner";

// Types
export {
  DangerType,
  Danger,
  AnalysisResult,
  Config,
  DEFAULT_CONFIG,
  DANGER_MESSAGES,
  Migration,
  MigrationClient,
  MigrationRecord,
  RunnerConfig,
} from "./types";
export type { SchemaSnapshot, TableInfo, ColumnInfo, IndexInfo, ConstraintInfo } from "./schema-inspector";

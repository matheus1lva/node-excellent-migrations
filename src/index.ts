// Public API — Analysis
export { analyzeFile, analyzeSource, analyzeDirectory } from "./analyzer.js";
export { formatReport, hasErrors } from "./reporter.js";
export { filterAssuredDangers } from "./safety-comments.js";
export { detectSqlDangers, detectBackfillDanger, detectAstDangers, enhanceDangersWithSchema } from "./detectors/index.js";

// Public API — Database
export { connect, disconnect, getPool } from "./db.js";
export { inspectSchema, getApproxRowCount, tableExists, columnExists } from "./schema-inspector.js";

// Public API — Migration Runner
export { migrate, rollback, status, getAppliedMigrations } from "./runner.js";

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
} from "./types.js";
export type { SchemaSnapshot, TableInfo, ColumnInfo, IndexInfo, ConstraintInfo } from "./schema-inspector.js";

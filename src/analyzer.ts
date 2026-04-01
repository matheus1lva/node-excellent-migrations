import * as fs from "fs";
import * as path from "path";
import { AnalysisResult, Config, DEFAULT_CONFIG, Danger } from "./types";
import { detectSqlDangers, detectBackfillDanger, detectAstDangers } from "./detectors";
import { filterAssuredDangers } from "./safety-comments";

const SQL_EXTENSIONS = new Set([".sql"]);
const JS_TS_EXTENSIONS = new Set([".js", ".ts", ".mjs", ".cjs", ".mts", ".cts"]);

/**
 * Analyzes a single migration file for dangerous operations.
 */
export function analyzeFile(
  filePath: string,
  config: Partial<Config> = {}
): AnalysisResult {
  const mergedConfig: Config = { ...DEFAULT_CONFIG, ...config };
  const source = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();

  let dangers: Danger[];

  if (SQL_EXTENSIONS.has(ext)) {
    dangers = [
      ...detectSqlDangers(source),
      ...detectBackfillDanger(source),
    ];
  } else if (JS_TS_EXTENSIONS.has(ext)) {
    dangers = detectAstDangers(source, filePath);
  } else {
    // Unknown extension — try SQL detection as fallback
    dangers = [
      ...detectSqlDangers(source),
      ...detectBackfillDanger(source),
    ];
  }

  // Filter out safety-assured dangers
  dangers = filterAssuredDangers(source, dangers);

  // Filter out skipped checks
  if (mergedConfig.skipChecks.length > 0) {
    const skipSet = new Set(mergedConfig.skipChecks);
    dangers = dangers.filter((d) => !skipSet.has(d.type));
  }

  // Deduplicate dangers (same type + same line)
  dangers = deduplicateDangers(dangers);

  return { filePath, dangers };
}

/**
 * Analyzes a string of SQL or JS/TS code directly (without reading from disk).
 */
export function analyzeSource(
  source: string,
  options: { fileName?: string; config?: Partial<Config> } = {}
): AnalysisResult {
  const { fileName = "migration.sql", config = {} } = options;
  const mergedConfig: Config = { ...DEFAULT_CONFIG, ...config };
  const ext = path.extname(fileName).toLowerCase();

  let dangers: Danger[];

  if (SQL_EXTENSIONS.has(ext)) {
    dangers = [
      ...detectSqlDangers(source),
      ...detectBackfillDanger(source),
    ];
  } else if (JS_TS_EXTENSIONS.has(ext)) {
    dangers = detectAstDangers(source, fileName);
  } else {
    dangers = [
      ...detectSqlDangers(source),
      ...detectBackfillDanger(source),
    ];
  }

  dangers = filterAssuredDangers(source, dangers);

  if (mergedConfig.skipChecks.length > 0) {
    const skipSet = new Set(mergedConfig.skipChecks);
    dangers = dangers.filter((d) => !skipSet.has(d.type));
  }

  dangers = deduplicateDangers(dangers);

  return { filePath: fileName, dangers };
}

/**
 * Analyzes all migration files in a directory.
 */
export function analyzeDirectory(
  dirPath: string,
  config: Partial<Config> = {}
): AnalysisResult[] {
  const mergedConfig: Config = { ...DEFAULT_CONFIG, ...config };
  const results: AnalysisResult[] = [];

  const files = collectMigrationFiles(dirPath);

  // Filter by startAfter if configured
  const filteredFiles = mergedConfig.startAfter
    ? files.filter((f) => path.basename(f) > mergedConfig.startAfter!)
    : files;

  for (const file of filteredFiles) {
    const result = analyzeFile(file, config);
    if (result.dangers.length > 0) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Recursively collects migration files from a directory.
 */
function collectMigrationFiles(dirPath: string): string[] {
  const files: string[] = [];
  const validExtensions = new Set([
    ...SQL_EXTENSIONS,
    ...JS_TS_EXTENSIONS,
  ]);

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (validExtensions.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dirPath);
  return files.sort();
}

/**
 * Remove duplicate dangers (same type on same line).
 */
function deduplicateDangers(dangers: Danger[]): Danger[] {
  const seen = new Set<string>();
  return dangers.filter((d) => {
    const key = `${d.type}:${d.line ?? "?"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

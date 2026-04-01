import { describe, it, expect } from "vitest";
import * as path from "path";
import { analyzeFile, analyzeSource, analyzeDirectory } from "../src/analyzer";
import { DangerType } from "../src/types";

const FIXTURES = path.join(__dirname, "fixtures");

describe("analyzeFile", () => {
  it("detects dangers in a SQL file", () => {
    const result = analyzeFile(path.join(FIXTURES, "dangerous.sql"));
    expect(result.dangers.length).toBeGreaterThan(0);

    const types = result.dangers.map((d) => d.type);
    expect(types).toContain(DangerType.COLUMN_REMOVED);
    expect(types).toContain(DangerType.COLUMN_ADDED_WITH_DEFAULT);
    expect(types).toContain(DangerType.COLUMN_TYPE_CHANGED);
    expect(types).toContain(DangerType.COLUMN_RENAMED);
    expect(types).toContain(DangerType.TABLE_RENAMED);
    expect(types).toContain(DangerType.TABLE_DROPPED);
    expect(types).toContain(DangerType.NOT_NULL_ADDED);
    expect(types).toContain(DangerType.INDEX_NOT_CONCURRENT);
    expect(types).toContain(DangerType.FOREIGN_KEY_ADDED);
    expect(types).toContain(DangerType.CHECK_CONSTRAINT_ADDED);
    expect(types).toContain(DangerType.UNIQUE_CONSTRAINT_ADDED);
    expect(types).toContain(DangerType.VOLATILE_DEFAULT);
    expect(types).toContain(DangerType.BACKFILL_IN_SAME_TRANSACTION);
  });

  it("reports no dangers for a safe SQL file", () => {
    const result = analyzeFile(path.join(FIXTURES, "safe.sql"));
    expect(result.dangers).toHaveLength(0);
  });

  it("respects safety assurance comments", () => {
    const result = analyzeFile(path.join(FIXTURES, "assured.sql"));
    // Both column_removed and table_dropped are assured away
    expect(result.dangers).toHaveLength(0);
  });

  it("respects skipChecks config", () => {
    const result = analyzeFile(path.join(FIXTURES, "dangerous.sql"), {
      skipChecks: [DangerType.COLUMN_REMOVED, DangerType.TABLE_DROPPED],
    });
    const types = result.dangers.map((d) => d.type);
    expect(types).not.toContain(DangerType.COLUMN_REMOVED);
    expect(types).not.toContain(DangerType.TABLE_DROPPED);
  });

  it("analyzes TypeScript migration files", () => {
    const result = analyzeFile(path.join(FIXTURES, "migration.ts"));
    expect(result.dangers.length).toBeGreaterThan(0);

    const types = result.dangers.map((d) => d.type);
    expect(types).toContain(DangerType.COLUMN_REMOVED);
    expect(types).toContain(DangerType.TABLE_DROPPED);
  });
});

describe("analyzeSource", () => {
  it("analyzes SQL from a string", () => {
    const result = analyzeSource("ALTER TABLE users DROP COLUMN email;");
    expect(result.dangers).toHaveLength(1);
    expect(result.dangers[0].type).toBe(DangerType.COLUMN_REMOVED);
  });

  it("analyzes JS/TS from a string", () => {
    const result = analyzeSource(
      'db.execute("ALTER TABLE users DROP COLUMN email");',
      { fileName: "migration.js" }
    );
    expect(result.dangers.some((d) => d.type === DangerType.COLUMN_REMOVED)).toBe(true);
  });
});

describe("analyzeDirectory", () => {
  it("analyzes all migration files in a directory", () => {
    const results = analyzeDirectory(FIXTURES);
    // Should find dangers in dangerous.sql and migration.ts, but not in safe.sql or assured.sql
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("respects startAfter config", () => {
    // All fixture files alphabetically come after "a", so startAfter "z" should skip them all
    const results = analyzeDirectory(FIXTURES, { startAfter: "z" });
    expect(results).toHaveLength(0);
  });
});

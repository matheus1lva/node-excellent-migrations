import { describe, it, expect } from "vitest";
import { detectAstDangers } from "../src/detectors/ast-detector.js";
import { DangerType } from "../src/types.js";

describe("AST Detector", () => {
  it("detects SQL dangers inside string literals", () => {
    const source = `
      export async function up(db) {
        await db.execute("ALTER TABLE users DROP COLUMN email");
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.COLUMN_REMOVED)).toBe(true);
  });

  it("detects SQL dangers inside template literals", () => {
    const source = `
      export async function up(db) {
        await db.execute(\`ALTER TABLE users ADD COLUMN age integer DEFAULT 0\`);
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.COLUMN_ADDED_WITH_DEFAULT)).toBe(true);
  });

  it("detects SQL dangers in tagged template literals", () => {
    const source = `
      export async function up(db) {
        await db.execute(sql\`DROP TABLE users\`);
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.TABLE_DROPPED)).toBe(true);
  });

  it("detects SQL in template expressions with interpolation", () => {
    const source = `
      export async function up(db) {
        const table = "users";
        await db.execute(\`ALTER TABLE \${table} ALTER COLUMN name TYPE text\`);
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.COLUMN_TYPE_CHANGED)).toBe(true);
  });

  it("detects raw SQL execution calls", () => {
    const source = `
      export async function up(knex) {
        await knex.raw("SELECT 1");
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.RAW_SQL_EXECUTED)).toBe(true);
  });

  it("ignores non-SQL strings", () => {
    const source = `
      export async function up(db) {
        console.log("hello world");
        const name = "John";
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers).toHaveLength(0);
  });

  it("detects multiple dangers in one file", () => {
    const source = `
      export async function up(db) {
        await db.execute("ALTER TABLE users DROP COLUMN email");
        await db.execute("ALTER TABLE users RENAME COLUMN name TO full_name");
        await db.execute("CREATE INDEX idx_users ON users (id)");
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    const types = dangers.map((d) => d.type);
    expect(types).toContain(DangerType.COLUMN_REMOVED);
    expect(types).toContain(DangerType.COLUMN_RENAMED);
    expect(types).toContain(DangerType.INDEX_NOT_CONCURRENT);
  });

  it("works with JavaScript files", () => {
    const source = `
      exports.up = async function(db) {
        await db.execute("ALTER TABLE users DROP COLUMN email");
      }
    `;
    const dangers = detectAstDangers(source, "migration.js");
    expect(dangers.some((d) => d.type === DangerType.COLUMN_REMOVED)).toBe(true);
  });

  it("detects backfill in same transaction across multiple strings", () => {
    const source = `
      export async function up(db) {
        await db.execute("ALTER TABLE users ADD COLUMN name text");
        await db.execute("UPDATE users SET name = 'unknown'");
      }
    `;
    const dangers = detectAstDangers(source, "migration.ts");
    expect(dangers.some((d) => d.type === DangerType.BACKFILL_IN_SAME_TRANSACTION)).toBe(true);
  });
});

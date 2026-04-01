import { describe, it, expect, vi } from "vitest";
import { enhanceDangersWithSchema } from "../src/detectors/schema-aware-detector";
import { Danger, DangerType, DANGER_MESSAGES } from "../src/types";

/**
 * Creates a mock Pool that returns controlled results for specific queries.
 */
function createMockPool(options: {
  tableExists?: boolean;
  rowCount?: number;
  columnExists?: boolean;
}) {
  return {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      // tableExists query
      if (sql.includes("information_schema.tables") && !sql.includes("columns")) {
        return {
          rows: options.tableExists ? [{ table_name: "users" }] : [],
        };
      }
      // columnExists query
      if (sql.includes("information_schema.columns")) {
        return {
          rows: options.columnExists ? [{ column_name: "email" }] : [],
        };
      }
      // rowCount query
      if (sql.includes("pg_class")) {
        return {
          rows: [{ estimate: options.rowCount ?? 0 }],
        };
      }
      return { rows: [] };
    }),
  } as any;
}

describe("Schema-Aware Detector", () => {
  it("adds large-table warning for blocking operations", async () => {
    const pool = createMockPool({ tableExists: true, rowCount: 500_000 });
    const dangers: Danger[] = [
      {
        type: DangerType.NOT_NULL_ADDED,
        message: DANGER_MESSAGES[DangerType.NOT_NULL_ADDED],
        line: 1,
        snippet: "ALTER TABLE users ALTER COLUMN name SET NOT NULL",
      },
    ];

    const enhanced = await enhanceDangersWithSchema(
      dangers,
      "ALTER TABLE users ALTER COLUMN name SET NOT NULL",
      pool
    );

    // Should have original + enhanced warning
    expect(enhanced.length).toBeGreaterThan(1);
    expect(enhanced.some((d) => d.message.includes("500,000 rows"))).toBe(true);
  });

  it("does not add large-table warning for small tables", async () => {
    const pool = createMockPool({ tableExists: true, rowCount: 50 });
    const dangers: Danger[] = [
      {
        type: DangerType.NOT_NULL_ADDED,
        message: DANGER_MESSAGES[DangerType.NOT_NULL_ADDED],
        line: 1,
        snippet: "ALTER TABLE users ALTER COLUMN name SET NOT NULL",
      },
    ];

    const enhanced = await enhanceDangersWithSchema(
      dangers,
      "ALTER TABLE users ALTER COLUMN name SET NOT NULL",
      pool
    );

    expect(enhanced).toHaveLength(1);
  });

  it("warns when dropping a column that does not exist", async () => {
    const pool = createMockPool({
      tableExists: true,
      rowCount: 100,
      columnExists: false,
    });
    const dangers: Danger[] = [
      {
        type: DangerType.COLUMN_REMOVED,
        message: DANGER_MESSAGES[DangerType.COLUMN_REMOVED],
        line: 1,
        snippet: "ALTER TABLE users DROP COLUMN email",
      },
    ];

    const enhanced = await enhanceDangersWithSchema(
      dangers,
      "ALTER TABLE users DROP COLUMN email",
      pool
    );

    expect(enhanced.some((d) => d.message.includes("does not exist"))).toBe(true);
  });

  it("does not add warnings for non-existent tables", async () => {
    const pool = createMockPool({ tableExists: false });
    const dangers: Danger[] = [
      {
        type: DangerType.NOT_NULL_ADDED,
        message: DANGER_MESSAGES[DangerType.NOT_NULL_ADDED],
        line: 1,
        snippet: "ALTER TABLE unknown_table ALTER COLUMN name SET NOT NULL",
      },
    ];

    const enhanced = await enhanceDangersWithSchema(
      dangers,
      "ALTER TABLE unknown_table ALTER COLUMN name SET NOT NULL",
      pool
    );

    // Only the original danger, no enhancements
    expect(enhanced).toHaveLength(1);
  });
});

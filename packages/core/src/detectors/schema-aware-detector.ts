import { Pool } from "pg";
import { Danger, DangerType, DANGER_MESSAGES } from "../types.js";
import { getApproxRowCount, tableExists, columnExists } from "../schema-inspector.js";

/**
 * Extracts table name from common SQL patterns.
 */
function extractTableName(sql: string): string | null {
  const patterns = [
    /ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS|ONLY)\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/i,
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:\w+\s+)?ON\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) {
      return match[2] ?? match[1];
    }
  }
  return null;
}

/**
 * Extracts column name from ALTER TABLE ... DROP/RENAME/ALTER COLUMN patterns.
 */
function extractColumnName(sql: string): string | null {
  const patterns = [
    /DROP\s+(?:COLUMN\s+)?"?(\w+)"?/i,
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+(?:SET|TYPE|DROP)/i,
    /RENAME\s+(?:COLUMN\s+)?"?(\w+)"?\s+TO/i,
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const LARGE_TABLE_THRESHOLD = 100_000;

/**
 * Enhances static danger analysis with schema-aware context from the live database.
 * Adds extra warnings for operations on large tables, validates that referenced
 * objects exist, etc.
 */
export async function enhanceDangersWithSchema(
  dangers: Danger[],
  source: string,
  pool: Pool
): Promise<Danger[]> {
  const enhanced: Danger[] = [...dangers];

  for (const danger of dangers) {
    const snippet = danger.snippet ?? "";

    const tableName = extractTableName(snippet) ?? extractTableName(source);
    if (!tableName) continue;

    const exists = await tableExists(tableName, "public", pool);
    if (!exists) continue;

    const rowCount = await getApproxRowCount(tableName, "public", pool);

    // Add large-table warnings for blocking operations
    if (
      rowCount > LARGE_TABLE_THRESHOLD &&
      [
        DangerType.COLUMN_ADDED_WITH_DEFAULT,
        DangerType.COLUMN_TYPE_CHANGED,
        DangerType.NOT_NULL_ADDED,
        DangerType.INDEX_NOT_CONCURRENT,
        DangerType.FOREIGN_KEY_ADDED,
        DangerType.CHECK_CONSTRAINT_ADDED,
        DangerType.UNIQUE_CONSTRAINT_ADDED,
      ].includes(danger.type)
    ) {
      enhanced.push({
        type: danger.type,
        message: `Table "${tableName}" has ~${rowCount.toLocaleString()} rows. This operation will be slow and block access. ${danger.message}`,
        line: danger.line,
        snippet: danger.snippet,
      });
    }

    // Verify column exists for DROP COLUMN
    if (danger.type === DangerType.COLUMN_REMOVED) {
      const colName = extractColumnName(snippet);
      if (colName) {
        const colExists = await columnExists(tableName, colName, "public", pool);
        if (!colExists) {
          enhanced.push({
            type: DangerType.COLUMN_REMOVED,
            message: `Column "${colName}" does not exist on table "${tableName}". This migration will fail.`,
            line: danger.line,
            snippet: danger.snippet,
          });
        }
      }
    }
  }

  return enhanced;
}

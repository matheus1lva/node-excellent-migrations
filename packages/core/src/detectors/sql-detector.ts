import { Danger, DangerType, DANGER_MESSAGES } from "../types.js";

/**
 * Patterns for detecting dangerous SQL operations.
 * Each pattern has a regex, the danger type it maps to, and optional extra logic.
 */
interface SqlPattern {
  pattern: RegExp;
  type: DangerType;
  /** Optional filter: return false to skip this match */
  filter?: (match: RegExpMatchArray, fullSql: string) => boolean;
}

const VOLATILE_FUNCTIONS = [
  "uuid_generate_v4",
  "gen_random_uuid",
  "clock_timestamp",
  "now",
  "random",
  "current_timestamp",
  "statement_timestamp",
  "transaction_timestamp",
  "timeofday",
];

const VOLATILE_PATTERN = new RegExp(
  `DEFAULT\\s+(?:${VOLATILE_FUNCTIONS.join("|")})\\s*\\(`,
  "i"
);

const SQL_PATTERNS: SqlPattern[] = [
  // DROP COLUMN
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+DROP\s+(?:COLUMN\s+)?\w+/gi,
    type: DangerType.COLUMN_REMOVED,
  },
  // ADD COLUMN ... DEFAULT (non-volatile)
  {
    pattern:
      /ALTER\s+TABLE\s+\S+\s+ADD\s+(?:COLUMN\s+)?\w+\s+\w+[^;]*DEFAULT\s+[^;]+/gi,
    type: DangerType.COLUMN_ADDED_WITH_DEFAULT,
    filter: (match) => !VOLATILE_PATTERN.test(match[0]),
  },
  // ADD COLUMN ... with volatile DEFAULT
  {
    pattern:
      /ALTER\s+TABLE\s+\S+\s+ADD\s+(?:COLUMN\s+)?\w+\s+\w+[^;]*DEFAULT\s+[^;]+/gi,
    type: DangerType.VOLATILE_DEFAULT,
    filter: (match) => VOLATILE_PATTERN.test(match[0]),
  },
  // ALTER COLUMN ... TYPE (change type)
  {
    pattern:
      /ALTER\s+TABLE\s+\S+\s+ALTER\s+(?:COLUMN\s+)?\w+\s+(?:SET\s+DATA\s+)?TYPE\s+/gi,
    type: DangerType.COLUMN_TYPE_CHANGED,
  },
  // RENAME COLUMN
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+RENAME\s+(?:COLUMN\s+)?\w+\s+TO\s+/gi,
    type: DangerType.COLUMN_RENAMED,
  },
  // RENAME TABLE
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+RENAME\s+TO\s+/gi,
    type: DangerType.TABLE_RENAMED,
    // Exclude "RENAME COLUMN x TO y" which was already handled
    filter: (match) => !/RENAME\s+(?:COLUMN\s+)\w+\s+TO/i.test(match[0]),
  },
  // DROP TABLE
  {
    pattern: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?\S+/gi,
    type: DangerType.TABLE_DROPPED,
  },
  // SET NOT NULL
  {
    pattern:
      /ALTER\s+TABLE\s+\S+\s+ALTER\s+(?:COLUMN\s+)?\w+\s+SET\s+NOT\s+NULL/gi,
    type: DangerType.NOT_NULL_ADDED,
  },
  // ADD COLUMN ... json (not jsonb)
  {
    pattern:
      /ALTER\s+TABLE\s+\S+\s+ADD\s+(?:COLUMN\s+)?\w+\s+json(?:\s|,|;|\))/gi,
    type: DangerType.JSON_COLUMN_ADDED,
  },
  // CREATE TABLE with json column
  {
    pattern: /\bjson(?:\s|,|\))/gi,
    type: DangerType.JSON_COLUMN_ADDED,
    filter: (match, fullSql) => {
      // Only match within CREATE TABLE context, not jsonb
      const idx = match.index ?? 0;
      const preceding = fullSql.substring(Math.max(0, idx - 200), idx);
      return (
        /CREATE\s+TABLE/i.test(preceding) &&
        !/jsonb/i.test(
          fullSql.substring(idx, idx + match[0].length).replace(/\s+$/, "")
        )
      );
    },
  },
  // CREATE INDEX (non-concurrent)
  {
    pattern: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/gi,
    type: DangerType.INDEX_NOT_CONCURRENT,
  },
  // ADD FOREIGN KEY / REFERENCES
  {
    pattern: /ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY/gi,
    type: DangerType.FOREIGN_KEY_ADDED,
  },
  // ADD CHECK CONSTRAINT
  {
    pattern: /ADD\s+(?:CONSTRAINT\s+\w+\s+)?CHECK\s*\(/gi,
    type: DangerType.CHECK_CONSTRAINT_ADDED,
    // Skip NOT VALID constraints (those are safe)
    filter: (match, fullSql) => {
      const afterMatch = fullSql.substring(
        (match.index ?? 0) + match[0].length
      );
      // Find the closing of this constraint - look for NOT VALID
      return !/NOT\s+VALID/i.test(afterMatch.substring(0, 200));
    },
  },
  // ADD UNIQUE CONSTRAINT
  {
    pattern: /ADD\s+(?:CONSTRAINT\s+\w+\s+)?UNIQUE/gi,
    type: DangerType.UNIQUE_CONSTRAINT_ADDED,
  },
];

/**
 * Finds the line number (1-based) for a character index in the source text.
 */
function lineForIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

/**
 * Detects dangerous operations in raw SQL content.
 */
export function detectSqlDangers(sql: string): Danger[] {
  const dangers: Danger[] = [];

  for (const { pattern, type, filter } of SQL_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      if (filter && !filter(match, sql)) continue;

      dangers.push({
        type,
        message: DANGER_MESSAGES[type],
        line: lineForIndex(sql, match.index),
        snippet: match[0].trim().substring(0, 120),
      });
    }
  }

  return dangers;
}

/**
 * Checks if SQL contains both schema changes and data updates (backfill in same transaction).
 */
export function detectBackfillDanger(sql: string): Danger[] {
  const hasSchemaChange =
    /ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE/i.test(sql);
  const hasDataUpdate = /\bUPDATE\s+\S+\s+SET\b/i.test(sql);

  if (hasSchemaChange && hasDataUpdate) {
    const updateMatch = sql.match(/\bUPDATE\s+\S+\s+SET\b/i);
    return [
      {
        type: DangerType.BACKFILL_IN_SAME_TRANSACTION,
        message: DANGER_MESSAGES[DangerType.BACKFILL_IN_SAME_TRANSACTION],
        line: updateMatch ? lineForIndex(sql, updateMatch.index ?? 0) : undefined,
        snippet: updateMatch?.[0],
      },
    ];
  }

  return [];
}

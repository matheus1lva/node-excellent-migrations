import {
  Danger,
  DangerType,
  SAFETY_ASSURED_NEXT_LINE,
  SAFETY_ASSURED_FILE,
} from "./types.js";

/**
 * Parses safety assurance comments from a migration file and filters out
 * any dangers that have been explicitly marked as safe.
 *
 * Supports two patterns:
 *   // excellent-migrations:safety-assured-for-next-line <danger_type>
 *   // excellent-migrations:safety-assured-for-this-file <danger_type>
 *
 * Also supports SQL comments:
 *   -- excellent-migrations:safety-assured-for-next-line <danger_type>
 *   -- excellent-migrations:safety-assured-for-this-file <danger_type>
 */
export function filterAssuredDangers(
  source: string,
  dangers: Danger[]
): Danger[] {
  const lines = source.split("\n");

  // Collect file-level assurances
  const fileAssured = new Set<string>();
  // Collect next-line assurances: map of line number -> set of danger types
  const nextLineAssured = new Map<number, Set<string>>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    let fileMatch = SAFETY_ASSURED_FILE.exec(line);
    if (fileMatch) {
      fileAssured.add(fileMatch[1]);
    }

    let nextLineMatch = SAFETY_ASSURED_NEXT_LINE.exec(line);
    if (nextLineMatch) {
      const targetLine = lineNum + 1;
      if (!nextLineAssured.has(targetLine)) {
        nextLineAssured.set(targetLine, new Set());
      }
      nextLineAssured.get(targetLine)!.add(nextLineMatch[1]);
    }
  }

  return dangers.filter((danger) => {
    // Skip if file-level assurance exists for this danger type
    if (fileAssured.has(danger.type)) return false;

    // Skip if next-line assurance exists for this danger's line
    if (
      danger.line &&
      nextLineAssured.has(danger.line) &&
      nextLineAssured.get(danger.line)!.has(danger.type)
    ) {
      return false;
    }

    return true;
  });
}

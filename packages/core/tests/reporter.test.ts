import { describe, it, expect } from "vitest";
import { formatReport, hasErrors } from "../src/reporter.js";
import { AnalysisResult, DangerType, DANGER_MESSAGES } from "../src/types.js";

describe("Reporter", () => {
  it("reports no dangers", () => {
    const output = formatReport([], { colors: false });
    expect(output).toContain("No dangerous operations detected");
  });

  it("formats dangers correctly", () => {
    const results: AnalysisResult[] = [
      {
        filePath: "migrations/001.sql",
        dangers: [
          {
            type: DangerType.COLUMN_REMOVED,
            message: DANGER_MESSAGES[DangerType.COLUMN_REMOVED],
            line: 5,
            snippet: "ALTER TABLE users DROP COLUMN email",
          },
        ],
      },
    ];

    const output = formatReport(results, { colors: false });
    expect(output).toContain("migrations/001.sql");
    expect(output).toContain("[column_removed]");
    expect(output).toContain(":5");
    expect(output).toContain("ALTER TABLE users DROP COLUMN email");
    expect(output).toContain("1 warning(s)");
  });

  it("reports errors when configured", () => {
    const results: AnalysisResult[] = [
      {
        filePath: "test.sql",
        dangers: [
          {
            type: DangerType.TABLE_DROPPED,
            message: DANGER_MESSAGES[DangerType.TABLE_DROPPED],
          },
        ],
      },
    ];

    const config = {
      severityOverrides: { [DangerType.TABLE_DROPPED]: "error" as const },
    };

    const output = formatReport(results, { colors: false, config });
    expect(output).toContain("1 error(s)");
  });
});

describe("hasErrors", () => {
  it("returns false when no errors", () => {
    const results: AnalysisResult[] = [
      {
        filePath: "test.sql",
        dangers: [
          { type: DangerType.COLUMN_REMOVED, message: "" },
        ],
      },
    ];
    expect(hasErrors(results)).toBe(false);
  });

  it("returns true when errors configured", () => {
    const results: AnalysisResult[] = [
      {
        filePath: "test.sql",
        dangers: [
          { type: DangerType.TABLE_DROPPED, message: "" },
        ],
      },
    ];
    const config = {
      severityOverrides: { [DangerType.TABLE_DROPPED]: "error" as const },
    };
    expect(hasErrors(results, config)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import plugin from "../src/index.js";

describe("eslint plugin", () => {
  it("reports dangerous migration SQL", () => {
    const reports: string[] = [];
    const rule = plugin.rules["no-dangerous-migration"];
    const listeners = rule.create({
      getFilename: () => "20260415120000_drop_column.ts",
      getSourceCode: () => ({
        text: `export const up = async (client) => {
  await client.query("ALTER TABLE users DROP COLUMN email");
};`,
      }),
      options: [],
      report(descriptor) {
        reports.push(descriptor.message);
      },
    });

    listeners.Program({ loc: { start: { line: 1, column: 0 } } });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain("[column_removed]");
  });

  it("exposes a recommended config", () => {
    expect(plugin.configs.recommended.rules).toEqual({
      "node-excellent-migrations/no-dangerous-migration": "error",
    });
  });

  it("exposes per-danger rules", () => {
    expect(plugin.rules["no-column_removed"]).toBeDefined();
    expect(plugin.rules["no-raw_sql_executed"]).toBeDefined();
  });
});

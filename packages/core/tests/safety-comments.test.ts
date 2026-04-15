import { describe, it, expect } from "vitest";
import { filterAssuredDangers } from "../src/safety-comments.js";
import { Danger, DangerType, DANGER_MESSAGES } from "../src/types.js";

function makeDanger(type: DangerType, line?: number): Danger {
  return { type, message: DANGER_MESSAGES[type], line };
}

describe("Safety Comments", () => {
  it("filters file-level assurances", () => {
    const source = `-- excellent-migrations:safety-assured-for-this-file column_removed
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN name;`;

    const dangers: Danger[] = [
      makeDanger(DangerType.COLUMN_REMOVED, 2),
      makeDanger(DangerType.COLUMN_REMOVED, 3),
    ];

    const filtered = filterAssuredDangers(source, dangers);
    expect(filtered).toHaveLength(0);
  });

  it("filters next-line assurances", () => {
    const source = `-- excellent-migrations:safety-assured-for-next-line column_removed
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN name;`;

    const dangers: Danger[] = [
      makeDanger(DangerType.COLUMN_REMOVED, 2),
      makeDanger(DangerType.COLUMN_REMOVED, 3),
    ];

    const filtered = filterAssuredDangers(source, dangers);
    // Only line 2 is assured, line 3 should remain
    expect(filtered).toHaveLength(1);
    expect(filtered[0].line).toBe(3);
  });

  it("works with JS-style comments", () => {
    const source = `// excellent-migrations:safety-assured-for-this-file table_dropped
db.execute("DROP TABLE temp");`;

    const dangers: Danger[] = [makeDanger(DangerType.TABLE_DROPPED, 2)];
    const filtered = filterAssuredDangers(source, dangers);
    expect(filtered).toHaveLength(0);
  });

  it("does not filter unrelated danger types", () => {
    const source = `-- excellent-migrations:safety-assured-for-this-file column_removed
ALTER TABLE users DROP COLUMN email;
DROP TABLE temp;`;

    const dangers: Danger[] = [
      makeDanger(DangerType.COLUMN_REMOVED, 2),
      makeDanger(DangerType.TABLE_DROPPED, 3),
    ];

    const filtered = filterAssuredDangers(source, dangers);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe(DangerType.TABLE_DROPPED);
  });
});

import { describe, it, expect } from "vitest";
import { detectSqlDangers, detectBackfillDanger } from "../src/detectors/sql-detector.js";
import { DangerType } from "../src/types.js";

describe("SQL Detector", () => {
  describe("column_removed", () => {
    it("detects DROP COLUMN", () => {
      const dangers = detectSqlDangers("ALTER TABLE users DROP COLUMN email;");
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.COLUMN_REMOVED);
    });

    it("detects DROP without COLUMN keyword", () => {
      const dangers = detectSqlDangers("ALTER TABLE users DROP email;");
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.COLUMN_REMOVED);
    });
  });

  describe("column_added_with_default", () => {
    it("detects ADD COLUMN with DEFAULT", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN age integer DEFAULT 0;"
      );
      expect(dangers.some((d) => d.type === DangerType.COLUMN_ADDED_WITH_DEFAULT)).toBe(true);
    });

    it("does not flag ADD COLUMN without DEFAULT", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN age integer;"
      );
      expect(dangers.some((d) => d.type === DangerType.COLUMN_ADDED_WITH_DEFAULT)).toBe(false);
    });
  });

  describe("volatile_default", () => {
    it("detects uuid_generate_v4() as volatile default", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN id uuid DEFAULT uuid_generate_v4();"
      );
      expect(dangers.some((d) => d.type === DangerType.VOLATILE_DEFAULT)).toBe(true);
    });

    it("detects gen_random_uuid() as volatile default", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN id uuid DEFAULT gen_random_uuid();"
      );
      expect(dangers.some((d) => d.type === DangerType.VOLATILE_DEFAULT)).toBe(true);
    });

    it("detects clock_timestamp() as volatile default", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN ts timestamptz DEFAULT clock_timestamp();"
      );
      expect(dangers.some((d) => d.type === DangerType.VOLATILE_DEFAULT)).toBe(true);
    });
  });

  describe("column_type_changed", () => {
    it("detects ALTER COLUMN TYPE", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ALTER COLUMN name TYPE text;"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.COLUMN_TYPE_CHANGED);
    });

    it("detects SET DATA TYPE", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ALTER COLUMN name SET DATA TYPE varchar(255);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.COLUMN_TYPE_CHANGED);
    });
  });

  describe("column_renamed", () => {
    it("detects RENAME COLUMN", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users RENAME COLUMN email TO email_address;"
      );
      expect(dangers.some((d) => d.type === DangerType.COLUMN_RENAMED)).toBe(true);
    });
  });

  describe("table_renamed", () => {
    it("detects RENAME TO", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE old_users RENAME TO archived_users;"
      );
      expect(dangers.some((d) => d.type === DangerType.TABLE_RENAMED)).toBe(true);
    });
  });

  describe("table_dropped", () => {
    it("detects DROP TABLE", () => {
      const dangers = detectSqlDangers("DROP TABLE users;");
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.TABLE_DROPPED);
    });

    it("detects DROP TABLE IF EXISTS", () => {
      const dangers = detectSqlDangers("DROP TABLE IF EXISTS users;");
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.TABLE_DROPPED);
    });
  });

  describe("not_null_added", () => {
    it("detects SET NOT NULL", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ALTER COLUMN name SET NOT NULL;"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.NOT_NULL_ADDED);
    });
  });

  describe("json_column_added", () => {
    it("detects json column type", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN metadata json;"
      );
      expect(dangers.some((d) => d.type === DangerType.JSON_COLUMN_ADDED)).toBe(true);
    });

    it("does not flag jsonb column type", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD COLUMN metadata jsonb;"
      );
      expect(dangers.some((d) => d.type === DangerType.JSON_COLUMN_ADDED)).toBe(false);
    });
  });

  describe("index_not_concurrent", () => {
    it("detects CREATE INDEX without CONCURRENTLY", () => {
      const dangers = detectSqlDangers(
        "CREATE INDEX idx_name ON users (name);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.INDEX_NOT_CONCURRENT);
    });

    it("detects CREATE UNIQUE INDEX without CONCURRENTLY", () => {
      const dangers = detectSqlDangers(
        "CREATE UNIQUE INDEX idx_email ON users (email);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.INDEX_NOT_CONCURRENT);
    });

    it("does not flag CREATE INDEX CONCURRENTLY", () => {
      const dangers = detectSqlDangers(
        "CREATE INDEX CONCURRENTLY idx_name ON users (name);"
      );
      expect(dangers).toHaveLength(0);
    });
  });

  describe("foreign_key_added", () => {
    it("detects ADD FOREIGN KEY", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.FOREIGN_KEY_ADDED);
    });
  });

  describe("check_constraint_added", () => {
    it("detects ADD CHECK constraint", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE orders ADD CONSTRAINT chk_amount CHECK (amount > 0);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.CHECK_CONSTRAINT_ADDED);
    });

    it("does not flag CHECK with NOT VALID", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE orders ADD CONSTRAINT chk_amount CHECK (amount > 0) NOT VALID;"
      );
      expect(dangers).toHaveLength(0);
    });
  });

  describe("unique_constraint_added", () => {
    it("detects ADD UNIQUE", () => {
      const dangers = detectSqlDangers(
        "ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE (email);"
      );
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.UNIQUE_CONSTRAINT_ADDED);
    });
  });

  describe("backfill detection", () => {
    it("detects UPDATE in same file as schema change", () => {
      const sql = `
        ALTER TABLE users ADD COLUMN name text;
        UPDATE users SET name = 'unknown' WHERE name IS NULL;
      `;
      const dangers = detectBackfillDanger(sql);
      expect(dangers).toHaveLength(1);
      expect(dangers[0].type).toBe(DangerType.BACKFILL_IN_SAME_TRANSACTION);
    });

    it("does not flag UPDATE without schema change", () => {
      const sql = "UPDATE users SET name = 'unknown' WHERE name IS NULL;";
      const dangers = detectBackfillDanger(sql);
      expect(dangers).toHaveLength(0);
    });
  });

  describe("line numbers", () => {
    it("reports correct line numbers", () => {
      const sql = `-- comment
ALTER TABLE users ADD COLUMN phone text;
ALTER TABLE users DROP COLUMN email;
`;
      const dangers = detectSqlDangers(sql);
      const dropDanger = dangers.find((d) => d.type === DangerType.COLUMN_REMOVED);
      expect(dropDanger?.line).toBe(3);
    });
  });
});

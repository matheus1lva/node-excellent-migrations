import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  createMigration,
  formatMigrationTimestamp,
  initProject,
  slugifyMigrationName,
} from "../src/creator.js";
import { CONFIG_FILE_NAME } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(__dirname, "fixtures", "tmp_creator");

afterEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("creator", () => {
  it("formats timestamps in sortable UTC format", () => {
    expect(formatMigrationTimestamp(new Date("2026-04-15T14:30:45.000Z"))).toBe("20260415143045");
  });

  it("slugifies migration names", () => {
    expect(slugifyMigrationName("Add Users Table")).toBe("add_users_table");
  });

  it("creates a new migration file with the configured extension", () => {
    const migrationsDir = path.join(TMP_ROOT, "migrations");
    const result = createMigration({
      migrationsDir,
      name: "Add Users Table",
      extension: ".mjs",
      now: new Date("2026-04-15T14:30:45.000Z"),
    });

    expect(result.fileName).toBe("20260415143045_add_users_table.mjs");
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, "utf8")).toContain("export const up = async (client)");
  });

  it("scaffolds a config file and migrations directory", () => {
    const result = initProject({ cwd: TMP_ROOT });

    expect(result.configPath).toBe(path.join(TMP_ROOT, CONFIG_FILE_NAME));
    expect(fs.existsSync(result.configPath)).toBe(true);
    expect(fs.existsSync(result.migrationsDir)).toBe(true);
    expect(fs.readFileSync(result.configPath, "utf8")).toContain('"migrationExtension": ".mjs"');
  });
});

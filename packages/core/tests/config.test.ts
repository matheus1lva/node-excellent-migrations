import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  CONFIG_FILE_NAME,
  findConfigFile,
  loadProjectConfig,
} from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(__dirname, "fixtures", "tmp_config");

afterEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("config", () => {
  it("returns defaults when no config file exists", () => {
    fs.mkdirSync(TMP_ROOT, { recursive: true });

    const loaded = loadProjectConfig();
    expect(loaded.path).toBeNull();
    expect(loaded.config.migrationsDir).toBe("./migrations");
    expect(loaded.config.migrationExtension).toBe(".mjs");
  });

  it("finds a config file by walking parent directories", () => {
    const projectRoot = path.join(TMP_ROOT, "project");
    const nestedDir = path.join(projectRoot, "packages", "api");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, CONFIG_FILE_NAME),
      JSON.stringify({ migrationsDir: "./db/migrations" }, null, 2)
    );

    expect(findConfigFile(nestedDir)).toBe(path.join(projectRoot, CONFIG_FILE_NAME));
  });

  it("merges config values with defaults", () => {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const configPath = path.join(TMP_ROOT, CONFIG_FILE_NAME);
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          migrationsDir: "./db/migrations",
          tableName: "custom_migrations",
          skipChecks: ["raw_sql_executed"],
        },
        null,
        2
      )
    );

    const loaded = loadProjectConfig(configPath);
    expect(loaded.config.migrationsDir).toBe("./db/migrations");
    expect(loaded.config.tableName).toBe("custom_migrations");
    expect(loaded.config.schema).toBe("public");
    expect(loaded.config.skipChecks).toEqual(["raw_sql_executed"]);
  });
});

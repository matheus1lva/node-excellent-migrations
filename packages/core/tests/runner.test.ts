import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("runner module (unit)", () => {
  it("migration file format requires up and down exports", async () => {
    const tmpDir = path.join(__dirname, "fixtures", "tmp_runner_test");
    fs.mkdirSync(tmpDir, { recursive: true });

    const migrationFile = path.join(tmpDir, "001_test.mjs");
    fs.writeFileSync(
      migrationFile,
      `export const up = async (client) => { await client.query("SELECT 1"); };`
    );

    try {
      const mod = await import(new URL(`file://${migrationFile}`).href);
      expect(typeof mod.up).toBe("function");
      expect(typeof mod.down).toBe("undefined");
    } finally {
      fs.unlinkSync(migrationFile);
      fs.rmdirSync(tmpDir);
    }
  });

  it("migration file with both up and down loads correctly", async () => {
    const tmpDir = path.join(__dirname, "fixtures", "tmp_runner_test2");
    fs.mkdirSync(tmpDir, { recursive: true });

    const migrationFile = path.join(tmpDir, "001_test.mjs");
    fs.writeFileSync(
      migrationFile,
      `
      export const up = async (client) => {
        await client.query("CREATE TABLE test (id serial PRIMARY KEY)");
      };
      export const down = async (client) => {
        await client.query("DROP TABLE test");
      };
      `
    );

    try {
      const mod = await import(new URL(`file://${migrationFile}`).href);
      expect(typeof mod.up).toBe("function");
      expect(typeof mod.down).toBe("function");
    } finally {
      fs.unlinkSync(migrationFile);
      fs.rmdirSync(tmpDir);
    }
  });

  it("up and down functions receive a client with query method", async () => {
    const tmpDir = path.join(__dirname, "fixtures", "tmp_runner_test3");
    fs.mkdirSync(tmpDir, { recursive: true });

    const queries: string[] = [];
    const mockClient = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
    };

    const migrationFile = path.join(tmpDir, "001_test.mjs");
    fs.writeFileSync(
      migrationFile,
      `
      export const up = async (client) => {
        await client.query("CREATE TABLE users (id serial PRIMARY KEY, name text)");
      };
      export const down = async (client) => {
        await client.query("DROP TABLE users");
      };
      `
    );

    try {
      const mod = await import(new URL(`file://${migrationFile}`).href);
      await mod.up(mockClient);
      await mod.down(mockClient);

      expect(queries).toEqual([
        "CREATE TABLE users (id serial PRIMARY KEY, name text)",
        "DROP TABLE users",
      ]);
    } finally {
      fs.unlinkSync(migrationFile);
      fs.rmdirSync(tmpDir);
    }
  });
});

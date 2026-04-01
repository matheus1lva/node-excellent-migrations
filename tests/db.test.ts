import { describe, it, expect, afterEach } from "vitest";
import { connect, getPool, disconnect, _resetPool } from "../src/db";

afterEach(() => {
  _resetPool();
});

describe("db module", () => {
  it("throws when getPool() called before connect()", () => {
    expect(() => getPool()).toThrow("Not connected");
  });

  it("throws when no DATABASE_URL or config provided", () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => connect()).toThrow("No database connection configured");
    } finally {
      if (original) process.env.DATABASE_URL = original;
    }
  });

  it("creates a pool from a connection string", () => {
    const pool = connect("postgres://localhost:5432/testdb");
    expect(pool).toBeDefined();
    expect(() => getPool()).not.toThrow();
  });

  it("reuses existing pool on repeated connect()", () => {
    const pool1 = connect("postgres://localhost:5432/testdb");
    const pool2 = connect("postgres://localhost:5432/other");
    expect(pool1).toBe(pool2);
  });

  it("creates a pool from DATABASE_URL env var", () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/envdb";
    try {
      const pool = connect();
      expect(pool).toBeDefined();
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it("creates a pool from PoolConfig object", () => {
    const pool = connect({ host: "localhost", port: 5432, database: "testdb" });
    expect(pool).toBeDefined();
  });
});

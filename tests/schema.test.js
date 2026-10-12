// @vitest-environment node
import { describe, it, expect } from "vitest";

import Database from "better-sqlite3";

import { checkSchema, readSchemaInfo, openDb } from "../src/lib/server/db.js";
import {
  parseIndexId,
  indexId,
  SCHEMA_VERSION,
  SchemaMismatchError,
} from "../src/lib/server/schema.js";
import { makeFixture } from "./fixtures.js";

describe("index row ids", () => {
  it("round-trips kind:id", () => {
    expect(indexId("concept", 3)).toBe("concept:3");
    expect(parseIndexId("concept:3")).toEqual({ kind: "concept", id: 3 });
  });
  it("reads a bare id as a text chunk", () => {
    expect(parseIndexId(12)).toEqual({ kind: "text", id: 12 });
  });
});

describe("schema_version startup check", () => {
  it("accepts a matching schema", () => {
    const fx = makeFixture();
    const db = openDb(fx.dbPath);
    const info = checkSchema(db);
    expect(info.version).toBe(SCHEMA_VERSION);
    expect(info.embedding_dimensions).toBe(2048);
    expect(info.embedding_model).toBe("cohere/embed-v5.0");
    db.close();
    fx.cleanup();
  });

  it("fails loudly on a version mismatch", () => {
    const fx = makeFixture();
    const db = openDb(fx.dbPath);
    // Simulate a database written by a newer reader.
    db.close();
    const w = new Database(fx.dbPath);
    w.prepare("UPDATE schema_version SET version = 99").run();
    w.close();
    const ro = openDb(fx.dbPath);
    expect(readSchemaInfo(ro).version).toBe(99);
    expect(() => checkSchema(ro)).toThrow(SchemaMismatchError);
    ro.close();
    fx.cleanup();
  });
});

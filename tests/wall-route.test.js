// @vitest-environment node
// Route + paging tests for the Wall (contact sheet).
//
// The contract: tiles are grouped by work in reading order, every tile carries
// a keyset cursor, paging is keyset (no OFFSET), and a malformed cursor is a
// 400 rather than a silently different page.

import { afterEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load } from "../src/routes/wall/+page.server.js";
import { Store, parseWallCursor } from "../src/lib/server/db.js";
import { makeFixture } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
});

/** Fixture (2 images, one work) plus a second work with one image. */
function runtime() {
  fx = makeFixture({ withQuotes: true });
  const w = new Database(fx.dbPath);
  w.prepare(
    `INSERT INTO book (id, work_key, title, author, format, source_path, source_sha256, added_at)
     VALUES (2, 'ico', 'ICO', 'Nick Suttner', 'epub', 'ico.epub', 'cafe', '2026-10-12')`,
  ).run();
  w.prepare(
    `INSERT INTO document_page (id, book_id, page_no, text, scanned, extractor_version, source_sha256)
     VALUES (3, 2, 1, 'A boy with horns.', 0, '1', 'cafe')`,
  ).run();
  w.prepare(
    `INSERT INTO image (id, sha256, path, w, h, mime, bytes, book_id, page_no, kind, extractor_version, source_sha256)
     VALUES (3, 'cafe01', '/img/ico.png', 640, 480, 'image/png', 4, 2, 1, 'embedded', '1', 'cafe')`,
  ).run();
  w.close();
  store = new Store(fx.dbPath);
  h.rt = { store, index: null, config: {} };
  return store;
}

const url = (params = {}) => {
  const u = new URL("http://localhost/wall");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
};

describe("wall screen", () => {
  it("groups tiles by work, in reading order", async () => {
    runtime();
    const data = await load({ url: url() });
    expect(data.groups.map((g) => g.bookId)).toEqual([1, 2]);
    expect(data.groups[0].title).toBe("Shadow of the Colossus");
    expect(data.groups[0].images.map((i) => i.id)).toEqual([1, 2]);
    expect(data.groups[1].images.map((i) => i.id)).toEqual([3]);
    expect(data.hasMore).toBe(false);
    expect(data.nextCursor).toBeNull();
  });

  it("filters to one work", async () => {
    runtime();
    const data = await load({ url: url({ book: "2" }) });
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].bookId).toBe(2);
    expect(data.bookId).toBe(2);
  });

  it("rejects a malformed cursor with 400 before touching the record", async () => {
    runtime();
    await expect(load({ url: url({ after: "12" }) })).rejects.toMatchObject({ status: 400 });
    await expect(load({ url: url({ after: "a:b:c" }) })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a malformed book id", async () => {
    runtime();
    await expect(load({ url: url({ book: "nope" }) })).rejects.toMatchObject({ status: 400 });
  });

  it("503s when the record cannot be opened", async () => {
    runtime();
    h.rt = new Error("SQLITE_CANTOPEN");
    await expect(load({ url: url() })).rejects.toMatchObject({ status: 503 });
  });
});

describe("keyset paging (Store.wallPage)", () => {
  it("pages without OFFSET and never repeats a row", async () => {
    runtime();
    const first = store.wallPage({ limit: 2 });
    expect(first.images.map((i) => i.id)).toEqual([1, 2]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe("1:2:2");

    const second = store.wallPage({ limit: 2, cursor: first.nextCursor });
    expect(second.images.map((i) => i.id)).toEqual([3]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();

    const seen = [...first.images, ...second.images].map((i) => i.id);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("pages within one work on (page_no, id)", async () => {
    runtime();
    const first = store.wallPage({ bookId: 1, limit: 1 });
    expect(first.images.map((i) => i.id)).toEqual([1]);
    expect(first.nextCursor).toBe("1:1:1");
    const second = store.wallPage({ bookId: 1, limit: 1, cursor: first.nextCursor });
    expect(second.images.map((i) => i.id)).toEqual([2]);
    expect(second.hasMore).toBe(false);
  });

  it("orders by book, then page, then id", async () => {
    runtime();
    expect(store.wallPage({ limit: 10 }).images.map((i) => 
      `${i.book_id}:${i.page_no}:${i.id}`)).toEqual(["1:1:1", "1:2:2", "2:1:3"]);
  });

  it("parses only <book>:<page>:<id> cursors", () => {
    expect(parseWallCursor(null)).toBeNull();
    expect(parseWallCursor("1:2:3")).toEqual({ bookId: 1, pageNo: 2, id: 3 });
    for (const bad of ["", "1:2", "1:2:3:4", "x:2:3", "1:2:-3"]) {
      if (bad === "") {
        expect(parseWallCursor(bad)).toBeNull();
      } else {
        expect(() => parseWallCursor(bad)).toThrow(TypeError);
      }
    }
  });
});

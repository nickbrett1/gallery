// @vitest-environment node
// Route tests for book browse (`/books` list and `/books/[id]` detail). The
// runtime singleton is mocked; the real schema-v2 fixture record backs the
// store. Covers the derived cover, the pages+images shape, 404 on unknown id,
// and 503 on a runtime failure.

import { afterEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load as loadList } from "../src/routes/books/+page.server.js";
import { load as loadDetail } from "../src/routes/books/[id]/+page.server.js";
import { Store } from "../src/lib/server/db.js";
import { makeFixture } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
});

/** Open a fresh fixture + store and publish it as the mocked runtime. */
function runtime() {
  fx = makeFixture();
  store = new Store(fx.dbPath);
  h.rt = { config: {}, store };
  return { fx, store };
}

describe("/books list", () => {
  it("attaches the derived cover (first image) and counts", async () => {
    runtime();
    const data = await loadList();
    expect(data.error).toBeNull();
    expect(data.books).toHaveLength(1);
    expect(data.books[0].title).toBe("Shadow of the Colossus");
    expect(data.books[0].cover).toMatchObject({ id: 1, page_no: 1 });
    expect(data.counts.images).toBe(1);
  });

  it("leaves cover null for a work with no images", async () => {
    runtime();
    const w = new Database(fx.dbPath);
    w.prepare("DELETE FROM image").run();
    w.close();
    const data = await loadList();
    expect(data.books[0].cover).toBeNull();
  });

  it("degrades to an error notice instead of throwing", async () => {
    h.rt = new Error("boom");
    const data = await loadList();
    expect(data.error).toMatch(/boom/);
    expect(data.books).toEqual([]);
  });
});

describe("/books/[id] detail", () => {
  it("returns the book, pages, images and a cover", async () => {
    runtime();
    const data = await loadDetail({ params: { id: "1" } });
    expect(data.error).toBeNull();
    expect(data.book.work_key).toBe("sotc");
    expect(data.pages).toHaveLength(1);
    expect(data.images).toHaveLength(1);
    expect(data.cover.id).toBe(1);
  });

  it("derives the cover as the FIRST image in reading order (page_no, id)", async () => {
    fx = makeFixture();
    // An image on an earlier page wins the cover, regardless of insertion id.
    const w = new Database(fx.dbPath);
    w.prepare(
      `INSERT INTO image (id, sha256, path, mime, bytes, book_id, page_no, kind, extractor_version, source_sha256, thumb)
       VALUES (2, 'ffff', '/img/f.png', 'image/png', 1, 1, 0, 'cover', '1', 'deadbeef', ?)`,
    ).run(Buffer.from([1]));
    w.close();
    store = new Store(fx.dbPath);
    h.rt = { config: {}, store };

    const data = await loadDetail({ params: { id: "1" } });
    expect(data.images.map((i) => i.id)).toEqual([2, 1]);
    expect(data.cover.id).toBe(2);
  });

  it("404s an unknown book id", async () => {
    runtime();
    await expect(loadDetail({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
  });

  it("404s a non-integer id", async () => {
    runtime();
    await expect(loadDetail({ params: { id: "abc" } })).rejects.toMatchObject({ status: 404 });
  });

  it("503s when the runtime cannot be opened", async () => {
    h.rt = new Error("no mount");
    await expect(loadDetail({ params: { id: "1" } })).rejects.toMatchObject({ status: 503 });
  });
});

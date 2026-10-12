// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";

import { Store } from "../src/lib/server/db.js";
import { makeFixture } from "./fixtures.js";

let fx;
let store;
afterEach(() => {
  store?.close();
  fx?.cleanup();
});

describe("Store (read-only record)", () => {
  it("lists works and their pages/images", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const books = store.listBooks();
    expect(books).toHaveLength(1);
    expect(books[0].work_key).toBe("sotc");
    expect(store.pagesForBook(1)).toHaveLength(1);
    expect(store.imagesForBook(1)[0].has_thumb).toBe(1);
  });

  it("shapes a chunk citation", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const c = store.getChunk(1);
    expect(c.title).toBe("Shadow of the Colossus");
    expect(c.page_no).toBe(1);
    expect(c.text).toContain("Forbidden Lands");
  });

  it("collapses a merged concept to its representative", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(store.resolveConceptId(2)).toBe(1);
    expect(store.resolveConceptId(1)).toBe(1);
  });

  it("returns concept citations joined to book/page", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const cites = store.conceptCitations(1);
    expect(cites).toHaveLength(1);
    expect(cites[0].title).toBe("Shadow of the Colossus");
    expect(cites[0].page_no).toBe(1);
    expect(cites[0].surface).toBe("Wander");
  });

  it("reports counts", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(store.counts()).toEqual({
      books: 1,
      pages: 1,
      chunks: 1,
      images: 1,
      concepts: 2,
    });
  });
});

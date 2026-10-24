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

describe("Store gaps", () => {
  it("filters the image gallery by book and paginates", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(store.listImages({ bookId: 1 })).toHaveLength(1);
    expect(store.listImages({ bookId: 99 })).toHaveLength(0);
    expect(store.countImages()).toBe(1);
  });

  it("serves a page, an image and its thumbnail", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(store.getPage(1).page_no).toBe(1);
    const img = store.getImage(1);
    expect(img.mime).toBe("image/png");
    expect(img.caption).toBe("cover art");
    const thumb = store.getImageThumb(1);
    expect(Buffer.isBuffer(thumb.thumb)).toBe(true);
  });

  it("lists concepts by mention count and finds co-occurring concepts", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const concepts = store.listConcepts();
    expect(concepts[0].name).toBe("Wander");
    expect(concepts[0].mentions).toBe(1);
    expect(store.relatedConcepts(1)).toEqual([]);
  });

  it("returns null for missing rows and leaves unknown ids unresolved", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(store.getBook(999)).toBeNull();
    expect(store.getImage(999)).toBeNull();
    expect(store.getConcept(999)).toBeNull();
    expect(store.getChunk(999)).toBeNull();
    expect(store.getImageThumb(999)).toBeNull();
    expect(store.resolveConceptId(999)).toBe(999);
  });
});

describe("Store quotes (schema v4/v5)", () => {
  it("joins page_no/book/work_key onto the quote (they are not quote columns)", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    const [q] = store.quotesForPage(1);
    expect(q.text).toMatch(/Wander enters/);
    expect(q.page_no).toBe(1);
    expect(q.book_id).toBe(1);
    expect(q.work_key).toBe("sotc");
  });

  it("ranks by score and cuts the candidate tail by default", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    const shown = store.quotesForPage(1);
    expect(shown.map((q) => q.id)).toEqual([1]);
    expect(shown[0].score).toBeGreaterThanOrEqual(0.69);
    // The weak quote is still in the record; it is only not displayable.
    expect(store.quotesForPage(1, { minScore: 0 }).map((q) => q.id)).toEqual([1, 2]);
  });

  it("resolves an image to its page (image has book_id + page_no, no page_id)", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    expect(store.pageForImage(1)).toEqual({ page_id: 1, page_no: 1, book_id: 1 });
    expect(store.pageForImage(999)).toBeNull();
    expect(store.quotesForImage(1)).toHaveLength(1);
    expect(store.quotesForImage(2)).toEqual([]);
  });

  it("finds quotes linked to a concept and the chips for a quote", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    expect(store.quotesForConcept(1).map((q) => q.id)).toEqual([1]);
    expect(store.quotesForConcept(2)).toEqual([]);
    const chips = store.quoteConcepts(1);
    expect(chips).toEqual([{ id: 1, name: "Wander", type: "character", confidence: 0.9 }]);
    expect(store.conceptsForQuotes([1, 2])).toEqual({
      1: [{ id: 1, name: "Wander", type: "character", confidence: 0.9 }],
    });
    expect(store.conceptsForQuotes([])).toEqual({});
  });

  it("reads the v5 extraction checkpoint", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    expect(store.quoteCheckpoint(1)).toMatchObject({ page_id: 1, extractor_version: "1" });
    expect(store.quoteCheckpoint(2)).toBeNull();
  });

  it("batch-loads images and picks a random plate", () => {
    fx = makeFixture({ withQuotes: true });
    store = new Store(fx.dbPath);
    expect(store.imagesByIds([1, 2, 999]).map((i) => i.id).sort()).toEqual([1, 2]);
    expect(store.imagesByIds([])).toEqual([]);
    expect([1, 2]).toContain(store.randomImageId());
  });
});

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

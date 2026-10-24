// @vitest-environment node
// Route tests for the Plate (the exploratory UI's first screen).
//
// The contract these guard:
//   - a displayable quote row is labelled `quote` and carries its chips;
//   - when the page has no quote above the cut, the nearest chunk is labelled
//     `passage` — never `quote`;
//   - adjacency excludes the plate itself and keeps distance order;
//   - unknown ids 404, a broken runtime 503s.

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load as loadPlate } from "../src/routes/plate/[id]/+page.server.js";
import { load as loadDrift } from "../src/routes/plate/+page.server.js";
import { Store } from "../src/lib/server/db.js";
import { makeFixture, makeFakeIndex } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
});

function runtime(indexRows = {}) {
  fx = makeFixture({ withQuotes: true });
  store = new Store(fx.dbPath);
  const index = makeFakeIndex({
    vectors: { "image:1": [1, 0], "image:2": [0, 1] },
    ...indexRows,
  });
  h.rt = { config: { imagesDir: fx.imagesDir }, store, index };
  return index;
}

const ids = (rows) => rows.map((r) => r.id);

describe("plate screen", () => {
  it("shows the strongest quote, labelled quote, with its concept chips", async () => {
    runtime();
    const data = await loadPlate({ params: { id: "1" } });
    expect(data.quote).not.toBeNull();
    expect(data.quote.kind).toBe("quote");
    expect(data.quote.quoteKind).toBe("observation");
    expect(data.quote.text).toMatch(/Wander enters/);
    expect(data.quote.score).toBeCloseTo(0.95);
    // quote.page_no / book come from the joins, not from the quote row.
    expect(data.quote.page_no).toBe(1);
    expect(data.book.title).toBe("Shadow of the Colossus");
    expect(ids(data.quote.concepts)).toEqual([1]);
    expect(data.passage).toBeNull();
  });

  it("never shows the weak tail as a quote (score below the display cut)", async () => {
    runtime();
    const data = await loadPlate({ params: { id: "1" } });
    expect(data.quote.text).not.toMatch(/^the Forbidden Lands\.$/);
    expect(data.quote.score).toBeGreaterThanOrEqual(0.69);
  });

  it("falls back to a passage — labelled passage — when the page has no quote", async () => {
    const index = runtime({
      vector: [{ id: "text:1", kind: "text", bookId: 1, pageId: 1, text: "Wander enters", score: null, distance: 0.2 }],
    });
    const data = await loadPlate({ params: { id: "2" } });
    expect(data.quote).toBeNull();
    expect(data.passage).not.toBeNull();
    expect(data.passage.kind).toBe("passage");
    expect(data.passage.text).toMatch(/Forbidden Lands/);
    expect(data.passage.page_no).toBe(1);
    // the passage hop is a text-only vector search from the plate's own vector
    const vecCall = index.calls.find((c) => c.method === "vector");
    expect(vecCall.kinds).toEqual(["text"]);
    expect(vecCall.vector).toEqual([0, 1]);
  });

  it("returns no passage (and still renders) when the plate has no vector", async () => {
    runtime({ vectors: {} });
    const data = await loadPlate({ params: { id: "2" } });
    expect(data.quote).toBeNull();
    expect(data.passage).toBeNull();
    expect(data.nearby).toEqual([]);
    expect(data.plate.id).toBe(2);
  });

  it("orders nearby plates by distance and excludes the plate itself", async () => {
    runtime({
      vector: [
        { id: "image:1", kind: "image", bookId: 1, pageId: 1, text: null, score: null, distance: 0 },
        { id: "image:2", kind: "image", bookId: 1, pageId: 2, text: null, score: null, distance: 0.1 },
        { id: "image:9", kind: "image", bookId: 1, pageId: 9, text: null, score: null, distance: 0.2 },
      ],
    });
    const data = await loadPlate({ params: { id: "1" } });
    // image:9 is not in the record → dropped, not invented
    expect(ids(data.nearby)).toEqual([2]);
  });

  it("404s an unknown image and a non-integer id", async () => {
    runtime();
    await expect(loadPlate({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
    await expect(loadPlate({ params: { id: "abc" } })).rejects.toMatchObject({ status: 404 });
  });

  it("503s when the record cannot be opened", async () => {
    runtime();
    h.rt = new Error("SQLITE_CANTOPEN");
    await expect(loadPlate({ params: { id: "1" } })).rejects.toMatchObject({ status: 503 });
  });
});

describe("plate drift entry", () => {
  it("redirects to a real plate", async () => {
    runtime();
    await expect(loadDrift()).rejects.toMatchObject({ status: 307, location: expect.stringMatching(/^\/plate\/[12]$/) });
  });

  it("503s when the record cannot be opened", async () => {
    runtime();
    h.rt = new Error("boom");
    await expect(loadDrift()).rejects.toMatchObject({ status: 503 });
  });
});

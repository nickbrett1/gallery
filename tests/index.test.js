// @vitest-environment node
// The native Lance query chain is mocked here: these tests assert the MODULE's
// contract — typed shaping, the base-columns-only hybrid select, and that the
// kind filter is applied (as `kind IN (...)`) only when a filter exists.
// The real native chain is exercised separately by scripts/lance-smoke.mjs.
import { describe, it, expect } from "vitest";

import {
  LanceIndex,
  assertBindingVersion,
  bindingVersion,
  shapeHit,
} from "../src/lib/server/index.js";
import { IndexVersionError } from "../src/lib/server/schema.js";

/** A fake Lance `query()` builder that records the calls the module made. */
function fakeTable(rows) {
  const calls = [];
  function makeBuilder() {
    const state = { nearestTo: null, fullText: null, rerank: null, select: null, limit: null, where: null };
    const b = {
      nearestTo(v) { state.nearestTo = v; return b; },
      fullTextSearch(t, o) { state.fullText = { t, o }; return b; },
      where(w) { state.where = w; return b; },
      rerank(r) { state.rerank = r; return b; },
      select(cols) { state.select = cols; return b; },
      limit(n) { state.limit = n; return b; },
      async toArray() { calls.push(state); return rows; },
    };
    return b;
  }
  return { calls, query: () => makeBuilder(), countRows: async () => rows.length };
}

/** A LanceIndex with the native reranker factory short-circuited. */
function indexOver(rows) {
  const table = fakeTable(rows);
  const idx = new LanceIndex(table, { dimensions: 2048 });
  idx._reranker = { __fakeRRF: true }; // skip the native factory
  return { idx, table };
}

const RAW_HYBRID = [
  { id: "text:1", kind: "text", book_id: 1, page_id: 1, text: "Wander enters", _score: 0, _relevance_score: 0.033 },
  { id: "image:1", kind: "image", book_id: 1, page_id: 3, text: null, _score: 1, _relevance_score: 0.016 },
];

describe("shapeHit (typed result shape)", () => {
  it("maps the fused RRF score to `score`", () => {
    expect(shapeHit({ id: "text:1", kind: "text", book_id: 1, page_id: 2, text: "x", _score: 0, _relevance_score: 0.5 }))
      .toEqual({ id: "text:1", kind: "text", bookId: 1, pageId: 2, text: "x", score: 0.5, distance: null });
  });
  it("falls back to `_score` and null-fills missing fields", () => {
    expect(shapeHit({ id: "concept:1", kind: "concept", text: "Colossus", _score: 0.18 }))
      .toEqual({ id: "concept:1", kind: "concept", bookId: null, pageId: null, text: "Colossus", score: 0.18, distance: null });
  });
  it("carries `_distance` as `distance` for vector rows", () => {
    expect(shapeHit({ id: "image:1", kind: "image", _distance: 0 }).distance).toBe(0);
  });
});

describe("hybridSearch", () => {
  it("selects BASE columns only (never _distance/_score, which throw on 0.40.0)", async () => {
    const { idx, table } = indexOver(RAW_HYBRID);
    await idx.hybridSearch({ vector: [0, 0], text: "colossus", topK: 5 });
    const { select } = table.calls[0];
    expect(select).toEqual(["id", "kind", "text", "book_id", "page_id"]);
    expect(select).not.toContain("_distance");
    expect(select).not.toContain("_score");
  });

  it("orders the chain nearestTo -> fullTextSearch -> rerank and shapes rows", async () => {
    const { idx, table } = indexOver(RAW_HYBRID);
    const out = await idx.hybridSearch({ vector: [0, 0], text: "colossus", topK: 5 });
    const c = table.calls[0];
    expect(c.nearestTo).toEqual([0, 0]);
    expect(c.fullText).toEqual({ t: "colossus", o: { columns: "text" } });
    expect(c.rerank).toEqual({ __fakeRRF: true });
    expect(c.limit).toBe(5);
    expect(out.map((r) => r.score)).toEqual([0.033, 0.016]);
    expect(out.every((r) => "bookId" in r && "pageId" in r)).toBe(true);
  });

  it("applies the kind filter as `kind IN (...)` when kinds are given", async () => {
    const { idx, table } = indexOver(RAW_HYBRID);
    await idx.hybridSearch({ vector: [0, 0], text: "colossus", kinds: ["text", "concept"], topK: 5 });
    expect(table.calls[0].where).toBe("kind IN ('text','concept')");
  });

  it("does NOT call .where at all when no kinds are given (where(undefined) throws)", async () => {
    const { idx, table } = indexOver(RAW_HYBRID);
    await idx.hybridSearch({ vector: [0, 0], text: "colossus", topK: 5 });
    expect(table.calls[0].where).toBeNull();
  });
});

describe("single-branch searches", () => {
  it("vectorSearch selects _distance and maps it", async () => {
    const { idx, table } = indexOver([{ id: "image:1", kind: "image", book_id: 1, page_id: 3, text: null, _distance: 0.12 }]);
    const out = await idx.vectorSearch({ vector: [1, 2], kinds: ["image"], topK: 3 });
    expect(table.calls[0].select).toEqual(["id", "kind", "text", "book_id", "page_id", "_distance"]);
    expect(table.calls[0].where).toBe("kind IN ('image')");
    expect(out[0].distance).toBe(0.12);
    expect(out[0].score).toBeNull();
  });

  it("textSearch selects _score and maps it", async () => {
    const { idx, table } = indexOver([{ id: "text:1", kind: "text", book_id: 1, page_id: 1, text: "x", _score: 0.42 }]);
    const out = await idx.textSearch({ text: "x", topK: 3 });
    expect(table.calls[0].select).toEqual(["id", "kind", "text", "book_id", "page_id", "_score"]);
    expect(table.calls[0].where).toBeNull();
    expect(out[0].score).toBe(0.42);
  });
});

describe("binding version pin", () => {
  it("reads the installed @lancedb/lancedb version (0.40.0)", () => {
    expect(bindingVersion()).toBe("0.40.0");
  });
  it("accepts the pinned version and rejects a mismatch", () => {
    expect(() => assertBindingVersion("0.40.0")).not.toThrow();
    expect(() => assertBindingVersion("0.39.9")).toThrow(IndexVersionError);
    expect(() => assertBindingVersion(null)).toThrow(IndexVersionError);
  });
});

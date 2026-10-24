// @vitest-environment node
// The Constellation is an ego-graph, one hop, and the edge weight is
// co-occurrence — the only relation the record actually holds.

import { afterEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load } from "../src/routes/constellation/[id]/+page.server.js";
import { clearPortraitCache } from "../src/lib/server/portraits.js";
import { Store } from "../src/lib/server/db.js";
import { layoutEgo, nodeRadius, VIEW } from "../src/lib/server/graph.js";
import { makeFixture, makeFakeIndex } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
  clearPortraitCache();
});

/** Fixture + a third concept that shares page 1 (so concept 1 has a neighbour). */
function runtime(indexRows = {}) {
  fx = makeFixture({ withQuotes: true });
  const w = new Database(fx.dbPath);
  w.prepare(`INSERT INTO concept (id, name, type) VALUES (3, 'Mono', 'character')`).run();
  w.prepare(`INSERT INTO concept_surface (id, concept_id, surface) VALUES (3, 3, 'Mono')`).run();
  w.prepare(
    `INSERT INTO concept_mention (id, concept_id, surface_id, page_id, start_offset, end_offset)
     VALUES (3, 3, 3, 1, 40, 44)`,
  ).run();
  w.close();
  store = new Store(fx.dbPath);
  const index = makeFakeIndex({
    vectors: { "concept:1": [1, 0, 0], "concept:3": [0, 1, 0] },
    ...indexRows,
  });
  h.rt = { store, index, config: {} };
  return index;
}

const IMAGE_HIT = [{ id: "image:1", kind: "image", bookId: 1, pageId: 1, text: null, score: null, distance: 0.2 }];

describe("constellation route", () => {
  it("places the concept at the centre with its citation count", async () => {
    runtime({ vector: IMAGE_HIT });
    const data = await load({ params: { id: "1" } });
    expect(data.concept.name).toBe("Wander");
    expect(data.concept.mentions).toBe(1);
    expect(data.citations).toBe(1);
    expect(data.graph.nodes.find((n) => n.isCentre).id).toBe(1);
  });

  it("rings only co-occurring concepts, one hop", async () => {
    runtime({ vector: IMAGE_HIT });
    const data = await load({ params: { id: "1" } });
    expect(data.neighbours.map((n) => n.name)).toEqual(["Mono"]);
    expect(data.graph.edges).toEqual([
      { from: 1, to: 3, weight: 1, sharedPages: 1 },
    ]);
  });

  it("collapses a merged concept id to its representative", async () => {
    runtime({ vector: IMAGE_HIT });
    await expect(load({ params: { id: "2" } })).rejects.toMatchObject({
      status: 307,
      location: "/constellation/1",
    });
  });

  it("gives the centre a portrait from its nearest image, cached per concept", async () => {
    const index = runtime({ vector: IMAGE_HIT });
    const data = await load({ params: { id: "1" } });
    expect(data.concept.portrait).toEqual({ id: 1, src: "/thumb/1" });
    const searchesBefore = index.calls.filter((c) => c.method === "vector").length;

    // Second request: portraits come from the cache, no new vector searches.
    h.rt = { ...h.rt, store };
    const again = await load({ params: { id: "1" } });
    expect(again.concept.portrait).toEqual({ id: 1, src: "/thumb/1" });
    expect(index.calls.filter((c) => c.method === "vector").length).toBe(searchesBefore);
  });

  it("survives a node with no portrait and no neighbours", async () => {
    runtime({ vectors: {} });
    const data = await load({ params: { id: "3" } });
    expect(data.concept.portrait).toBeNull();
    // concept 3 shares page 1 too, so it has one neighbour — but no images exist for it
    expect(data.neighbours).toHaveLength(1);
    expect(data.neighbours[0].portrait).toBeNull();
  });

  it("404s unknown and non-integer ids", async () => {
    runtime({ vector: IMAGE_HIT });
    await expect(load({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
    await expect(load({ params: { id: "wander" } })).rejects.toMatchObject({ status: 404 });
  });

  it("503s when the record cannot be opened", async () => {
    runtime();
    h.rt = new Error("SQLITE_CANTOPEN");
    await expect(load({ params: { id: "1" } })).rejects.toMatchObject({ status: 503 });
  });
});

describe("ego layout", () => {
  const centre = { id: 1, name: "Wander", type: "character", mentions: 20 };
  const nb = (id, shared) => ({ id, name: `c${id}`, type: "term", mentions: 4, shared_pages: shared });

  it("puts the centre in the middle and neighbours on one ring", () => {
    const g = layoutEgo(centre, [nb(2, 9), nb(3, 3)]);
    expect(g.width).toBe(VIEW.width);
    expect(g.nodes[0]).toMatchObject({ id: 1, isCentre: true, x: VIEW.width / 2, y: VIEW.height / 2 });
    const ring = g.nodes.slice(1).map((n) => Math.hypot(n.x - VIEW.width / 2, n.y - VIEW.height / 2));
    expect(ring[0]).toBeCloseTo(ring[1], 6);
    expect(g.nodes[1].y).toBeLessThan(VIEW.height / 2); // first node at the top
  });

  it("is deterministic and caps the ring at 12", () => {
    const many = Array.from({ length: 20 }, (_, i) => nb(i + 2, i));
    const a = layoutEgo(centre, many);
    const b = layoutEgo(centre, many);
    expect(a.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]))
      .toEqual(b.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]));
    expect(a.nodes).toHaveLength(13);
    expect(a.edges).toHaveLength(12);
  });

  it("normalises edge weight to the strongest relation (weak looks weak)", () => {
    const g = layoutEgo(centre, [nb(2, 10), nb(3, 2), nb(4, 0)]);
    expect(g.edges.map((e) => e.weight)).toEqual([1, 0.2, 0]);
  });

  it("scales node radius by sqrt(mentions) with a floor", () => {
    expect(nodeRadius(0)).toBe(16);
    expect(nodeRadius(60)).toBe(40);
    expect(nodeRadius(1000)).toBe(40);
    expect(nodeRadius(15)).toBeGreaterThan(16);
    expect(nodeRadius(15)).toBeLessThan(nodeRadius(40));
  });
});

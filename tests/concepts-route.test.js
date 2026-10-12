// @vitest-environment node
// Route tests for the concept pages (`/concepts` list, `/concepts/[id]` detail):
// canonical collapse via concept_resolution, alias + surface display, the
// co-occurrence "relations" view, the empty-citations state, 404 and 503.

import { afterEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load as loadList } from "../src/routes/concepts/+page.server.js";
import { load as loadDetail } from "../src/routes/concepts/[id]/+page.server.js";
import { Store } from "../src/lib/server/db.js";
import { makeFixture } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
});

function runtime() {
  fx = makeFixture();
  store = new Store(fx.dbPath);
  h.rt = { config: {}, store };
}

describe("/concepts list", () => {
  it("lists concepts most-cited first", async () => {
    runtime();
    const data = await loadList();
    expect(data.error).toBeNull();
    expect(data.concepts[0]).toMatchObject({ name: "Wander", mentions: 1 });
  });

  it("degrades on a runtime error", async () => {
    h.rt = new Error("no mount");
    const data = await loadList();
    expect(data.error).toMatch(/no mount/);
    expect(data.concepts).toEqual([]);
  });
});

describe("/concepts/[id] detail", () => {
  it("collapses a merged id to its representative and shows the alias", async () => {
    runtime();
    const data = await loadDetail({ params: { id: "2" } });
    expect(data.concept.name).toBe("Wander");
    expect(data.aliases).toEqual(["The Wanderer"]);
    expect(data.surfaces.map((s) => s.surface)).toEqual(["Wander"]);
    expect(data.citations).toHaveLength(1);
  });

  it("shows no alias when the id is already canonical", async () => {
    runtime();
    const data = await loadDetail({ params: { id: "1" } });
    expect(data.concept.name).toBe("Wander");
    expect(data.aliases).toEqual([]);
  });

  it("returns every citation behind the concept, joined to page + book", async () => {
    runtime();
    const data = await loadDetail({ params: { id: "1" } });
    expect(data.citations).toHaveLength(1);
    expect(data.citations[0]).toMatchObject({
      surface: "Wander",
      page_no: 1,
      book_id: 1,
      title: "Shadow of the Colossus",
    });
  });

  it("renders an empty-citations concept (no mentions) without error", async () => {
    fx = makeFixture();
    const w = new Database(fx.dbPath);
    w.prepare("INSERT INTO concept (id, name, type, description) VALUES (3, 'Empty', 'term', NULL)").run();
    w.close();
    store = new Store(fx.dbPath);
    h.rt = { config: {}, store };

    const data = await loadDetail({ params: { id: "3" } });
    expect(data.concept.name).toBe("Empty");
    expect(data.citations).toEqual([]);
    expect(data.surfaces).toEqual([]);
    expect(data.related).toEqual([]);
  });

  it("404s an unknown concept id", async () => {
    runtime();
    await expect(loadDetail({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
  });

  it("503s when the runtime cannot be opened", async () => {
    h.rt = new Error("no mount");
    await expect(loadDetail({ params: { id: "1" } })).rejects.toMatchObject({ status: 503 });
  });
});

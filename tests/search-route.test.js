// @vitest-environment node
// Route tests for the search screen's server load (`src/routes/+page.server.js`).
// The runtime singleton is mocked so the load function is exercised on its own
// contract: query/kind/mode parsing, citation grouping, and the graceful error
// path (a bad mount must render a notice, never a 500).

import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted so the mock factory can reach it before module init.
const hoisted = vi.hoisted(() => ({ runtime: null, calls: 0 }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    hoisted.calls += 1;
    if (hoisted.runtime instanceof Error) throw hoisted.runtime;
    return hoisted.runtime;
  },
}));

import { load } from "../src/routes/+page.server.js";
import { Store } from "../src/lib/server/db.js";
import { makeFakeIndex, makeFixture, sampleRows } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  hoisted.runtime = null;
  hoisted.calls = 0;
  vi.unstubAllGlobals();
  store?.close();
  fx?.cleanup();
});

/** A runtime backed by the real fixture record + an injected fake index. */
function runtimeWith(index) {
  fx = makeFixture();
  store = new Store(fx.dbPath);
  return {
    config: { litellmBaseUrl: "http://gw", litellmMasterKey: null },
    store,
    index,
    model: "cohere/embed-v5.0",
    dimensions: 2048,
  };
}

const at = (qs) => ({ url: new URL(`http://gallery.test/${qs}`) });

describe("search screen server load", () => {
  it("returns an empty state for a blank query without opening the runtime", async () => {
    const data = await load(at(""));
    expect(data.q).toBe("");
    expect(data.grouped).toBeNull();
    expect(data.error).toBeNull();
    expect(hoisted.calls).toBe(0);
  });

  it("parses kind + mode from the URL and forwards them to the retriever", async () => {
    const index = makeFakeIndex({ text: sampleRows });
    hoisted.runtime = runtimeWith(index);

    const data = await load(at("?q=wander&mode=text&kind=text,image,bogus"));

    expect(data.kinds).toEqual(["text", "image"]);
    expect(data.mode).toBe("text");
    // keyword-only never crosses the embedding hop.
    expect(index.calls[0]).toMatchObject({ method: "text", kinds: ["text", "image"] });
    expect(data.error).toBeNull();
  });

  it("groups enriched hits by work, with concepts and art kept separate", async () => {
    hoisted.runtime = runtimeWith(makeFakeIndex({ text: sampleRows }));

    const data = await load(at("?q=wander&mode=text"));

    expect(data.grouped.works).toHaveLength(1);
    expect(data.grouped.works[0].workKey).toBe("sotc");
    expect(data.grouped.works[0].hits[0]).toMatchObject({ kind: "text", pageNo: 1 });
    expect(data.grouped.works[0].hits[0].href).toBe("/books/1#page-1");
    expect(data.grouped.concepts).toHaveLength(1);
    expect(data.grouped.images).toHaveLength(1);
    expect(data.grouped.images[0].href).toBe("/images?focus=1");
  });

  it("runs the hybrid path (embedding hop) by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: new Array(2048).fill(0.01) }] }),
      })),
    );
    const index = makeFakeIndex({ hybrid: sampleRows });
    hoisted.runtime = runtimeWith(index);

    const data = await load(at("?q=colossus"));

    expect(data.mode).toBe("hybrid");
    expect(index.calls[0].method).toBe("hybrid");
    expect(index.calls[0].text).toBe("colossus");
    expect(data.grouped.works[0].hits).toHaveLength(1);
  });

  it("surfaces a data error instead of throwing when the runtime fails", async () => {
    hoisted.runtime = new Error("ENOENT: no such file or directory, open '/data/reader.db'");

    const data = await load(at("?q=wander"));

    expect(data.grouped).toBeNull();
    expect(data.error).toMatch(/ENOENT/);
  });
});

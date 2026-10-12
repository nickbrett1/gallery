// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";

import { Store } from "../src/lib/server/db.js";
import {
  enrichRows,
  groupResults,
  parseKinds,
  search,
} from "../src/lib/server/search.js";
import { makeFakeIndex, makeFixture, sampleRows } from "./fixtures.js";

let fx;
let store;
afterEach(() => {
  store?.close();
  fx?.cleanup();
});

function runtime(index, embed) {
  return {
    config: { litellmBaseUrl: "http://gw", litellmMasterKey: null },
    store,
    index,
    model: "cohere/embed-v5.0",
    dimensions: 2048,
    embed,
  };
}

describe("parseKinds", () => {
  it("keeps only known kinds and de-duplicates", () => {
    expect(parseKinds("text,image,image,bogus")).toEqual(["text", "image"]);
    expect(parseKinds("")).toBeNull();
    expect(parseKinds(null)).toBeNull();
  });
});

describe("enrichRows (citation shaping)", () => {
  it("turns index rows into citations against the record", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const out = enrichRows(store, sampleRows);
    expect(out).toHaveLength(3);
    const [text, concept, image] = out;
    expect(text.href).toBe("/books/1#page-1");
    expect(text.pageNo).toBe(1);
    expect(text.workKey).toBe("sotc");
    expect(concept.href).toBe("/concepts/1");
    expect(concept.name).toBe("Wander");
    expect(image.href).toBe("/images?focus=1");
    expect(image.imageId).toBe(1);
  });

  it("drops rows that no longer exist in the record", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    expect(enrichRows(store, [{ id: "text:999", kind: "text" }])).toHaveLength(0);
  });
});

describe("search orchestration", () => {
  it("embeds the query, forwards kind filters, and enriches", async () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const index = makeFakeIndex({ hybrid: sampleRows });
    const embed = async () => new Array(2048).fill(0.01);

    const { results, mode } = await search(
      runtime(index, embed),
      { query: "forbidden lands", kinds: ["text", "concept"], topK: 12 },
      { embed },
    );

    expect(mode).toBe("hybrid");
    expect(index.calls[0].method).toBe("hybrid");
    expect(index.calls[0].kinds).toEqual(["text", "concept"]);
    expect(index.calls[0].topK).toBe(12);
    expect(index.calls[0].text).toBe("forbidden lands");
    expect(results).toHaveLength(3);
  });

  it("keyword-only mode skips the embedding hop", async () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const index = makeFakeIndex({ text: [sampleRows[0]] });
    let embedCalled = false;
    const embed = async () => {
      embedCalled = true;
      return [];
    };
    const { results } = await search(
      runtime(index, embed),
      { query: "wander", mode: "text" },
    );
    expect(embedCalled).toBe(false);
    expect(index.calls[0].method).toBe("text");
    expect(results[0].kind).toBe("text");
  });

  it("returns nothing for an empty query", async () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const index = makeFakeIndex();
    const { results } = await search(runtime(index, async () => []), { query: "  " });
    expect(results).toEqual([]);
    expect(index.calls).toHaveLength(0);
  });
});

describe("groupResults", () => {
  it("groups text by work and separates concepts and art", () => {
    fx = makeFixture();
    store = new Store(fx.dbPath);
    const enriched = enrichRows(store, sampleRows);
    const g = groupResults(enriched);
    expect(g.works).toHaveLength(1);
    expect(g.works[0].hits).toHaveLength(1);
    expect(g.concepts).toHaveLength(1);
    expect(g.images).toHaveLength(1);
  });
});

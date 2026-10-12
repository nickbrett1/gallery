// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { embedQuery } from "../src/lib/server/embed.js";
import { createRuntime } from "../src/lib/server/runtime.js";
import { makeFixture } from "./fixtures.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const config = { litellmBaseUrl: "http://gw", litellmMasterKey: null };

describe("embedQuery default transport", () => {
  it("posts to the gateway and unwraps the vector", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe("http://gw/v1/embeddings");
      expect(JSON.parse(init.body).input).toEqual(["hi"]);
      return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 2] }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(embedQuery("hi", { config, model: "m" })).resolves.toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("raises on a non-OK gateway response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, text: async () => "bad gateway" })),
    );
    await expect(embedQuery("hi", { config, model: "m" })).rejects.toThrow(/gateway 502/);
  });
});

describe("createRuntime startup guards", () => {
  it("refuses a non-local index backend", async () => {
    const fx = makeFixture();
    await expect(
      createRuntime({
        dbPath: fx.dbPath,
        indexDir: `${fx.dir}/index`,
        indexBackend: "cloud",
      }),
    ).rejects.toThrow(/INDEX_BACKEND=cloud/);
    fx.cleanup();
  });

  it("propagates a schema mismatch", async () => {
    await expect(
      createRuntime({ dbPath: "/nonexistent/reader.db", indexBackend: "lancedb" }),
    ).rejects.toThrow();
  });
});

// @vitest-environment node
import { describe, it, expect } from "vitest";

import { embedQuery, EmbedError } from "../src/lib/server/embed.js";

const config = { litellmBaseUrl: "http://gw", litellmMasterKey: "sk-test" };

describe("embedQuery", () => {
  it("posts model+input and returns the vector", async () => {
    let seen;
    const post = async (url, headers, body) => {
      seen = { url, headers, body };
      return { data: [{ index: 0, embedding: new Array(2048).fill(0.5) }] };
    };
    const vec = await embedQuery("hello", {
      config,
      model: "cohere/embed-v5.0",
      dimensions: 2048,
      post,
    });
    expect(vec).toHaveLength(2048);
    expect(seen.url).toBe("http://gw/v1/embeddings");
    expect(seen.headers.Authorization).toBe("Bearer sk-test");
    expect(seen.body).toEqual({
      model: "cohere/embed-v5.0",
      input: ["hello"],
      dimensions: 2048,
    });
  });

  it("rejects a dimensionality mismatch with the pinned record", async () => {
    const post = async () => ({ data: [{ index: 0, embedding: new Array(1024).fill(0) }] });
    await expect(
      embedQuery("hello", { config, model: "m", dimensions: 2048, post }),
    ).rejects.toThrow(EmbedError);
  });

  it("errors when the gateway returns no embedding", async () => {
    const post = async () => ({ data: [] });
    await expect(
      embedQuery("hello", { config, model: "m", dimensions: 2048, post }),
    ).rejects.toThrow(EmbedError);
  });
});

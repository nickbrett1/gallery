// @vitest-environment node
import { describe, it, expect } from "vitest";

import { resolveConfig, DEFAULT_GATEWAY_URL, DEFAULT_DATA } from "../src/lib/server/config.js";

describe("resolveConfig", () => {
  it("derives the reader paths from a single data dir", () => {
    const c = resolveConfig({ GALLERY_DATA: "/mnt/vg-books" });
    expect(c.dbPath).toBe("/mnt/vg-books/reader.db");
    expect(c.indexDir).toBe("/mnt/vg-books/index");
    expect(c.imagesDir).toBe("/mnt/vg-books/images");
    expect(c.indexBackend).toBe("lancedb");
    expect(c.litellmBaseUrl).toBe(DEFAULT_GATEWAY_URL);
  });

  it("defaults the data dir and trims the gateway URL", () => {
    const c = resolveConfig({ LITELLM_BASE_URL: "http://nas:4000/" });
    expect(c.dataDir).toBe(DEFAULT_DATA);
    expect(c.litellmBaseUrl).toBe("http://nas:4000");
  });

  it("honours explicit overrides", () => {
    const c = resolveConfig({
      GALLERY_DATA: "/data",
      GALLERY_DB: "/tmp/x.db",
      INDEX_BACKEND: "LanceDB",
      LITELLM_MASTER_KEY: "sk-1",
      GALLERY_EMBED_DIMENSIONS: "1536",
    });
    expect(c.dbPath).toBe("/tmp/x.db");
    expect(c.indexBackend).toBe("lancedb");
    expect(c.litellmMasterKey).toBe("sk-1");
    expect(c.embeddingDimensionsOverride).toBe(1536);
  });
});

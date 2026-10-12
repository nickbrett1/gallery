// @vitest-environment node
// Route tests for the image surfaces: `/image/[id]` detail (strips path/thumb,
// joins the book, 404s) and `/thumb/[id]` (serves the inline SQLite BLOB, 404s
// when there is no thumbnail or no such image).

import { afterEach, describe, expect, it, vi } from "vitest";

import Database from "better-sqlite3";

const h = vi.hoisted(() => ({ rt: null }));
vi.mock("$lib/server/runtime.js", () => ({
  getRuntime: async () => {
    if (h.rt instanceof Error) throw h.rt;
    return h.rt;
  },
}));

import { load as loadDetail } from "../src/routes/image/[id]/+page.server.js";
import { GET as thumb } from "../src/routes/thumb/[id]/+server.js";
import { Store } from "../src/lib/server/db.js";
import { makeFixture } from "./fixtures.js";

let fx;
let store;

afterEach(() => {
  h.rt = null;
  store?.close();
  fx?.cleanup();
});

/** Open a fixture, optionally add a thumbnail-less image, publish the runtime. */
function runtime({ withBareImage = false } = {}) {
  fx = makeFixture();
  if (withBareImage) {
    const w = new Database(fx.dbPath);
    w.prepare(
      `INSERT INTO image (id, sha256, path, mime, bytes, book_id, page_no, kind, extractor_version, source_sha256, thumb)
       VALUES (2, 'beef', '/img/bare.png', 'image/png', 2, 1, 2, 'extracted', '1', 'deadbeef', NULL)`,
    ).run();
    w.close();
  }
  store = new Store(fx.dbPath);
  h.rt = { config: { imagesDir: fx.imagesDir }, store };
}

describe("/image/[id] detail", () => {
  it("returns the image metadata and the joined book, stripping path/thumb", async () => {
    runtime();
    const data = await loadDetail({ params: { id: "1" } });
    expect(data.error).toBeNull();
    expect(data.image).toMatchObject({ id: 1, mime: "image/png", caption: "cover art" });
    // The BLOB and the on-disk path never reach the page.
    expect(data.image).not.toHaveProperty("path");
    expect(data.image).not.toHaveProperty("thumb");
    expect(data.book).toMatchObject({ id: 1, work_key: "sotc" });
  });

  it("404s an unknown image id", async () => {
    runtime();
    await expect(loadDetail({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
  });

  it("404s a non-integer id", async () => {
    runtime();
    await expect(loadDetail({ params: { id: "abc" } })).rejects.toMatchObject({ status: 404 });
  });

  it("503s when the runtime cannot be opened", async () => {
    h.rt = new Error("no mount");
    await expect(loadDetail({ params: { id: "1" } })).rejects.toMatchObject({ status: 503 });
  });
});

describe("/thumb/[id]", () => {
  it("serves the inline BLOB as a cacheable image/png", async () => {
    runtime();
    const res = await thumb({ params: { id: "1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(Buffer.from([9, 9, 9]))).toBe(true);
  });

  it("404s when the row exists but has no thumbnail BLOB", async () => {
    runtime({ withBareImage: true });
    await expect(thumb({ params: { id: "2" } })).rejects.toMatchObject({ status: 404 });
  });

  it("404s for a missing image and a non-integer id", async () => {
    runtime();
    await expect(thumb({ params: { id: "999" } })).rejects.toMatchObject({ status: 404 });
    await expect(thumb({ params: { id: "abc" } })).rejects.toMatchObject({ status: 404 });
  });
});

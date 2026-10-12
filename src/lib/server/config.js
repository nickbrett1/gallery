// Environment + path resolution. Mirrors `reader/config.py`: gallery mounts the
// SAME data dir read-only, so the derived paths line up exactly.
//
//   READER_DATA/reader.db   ->  GALLERY_DATA/reader.db
//   READER_DATA/images      ->  GALLERY_DATA/images     (content-addressed blobs)
//   READER_DATA/index       ->  GALLERY_DATA/index      (Lance dir, table `chunks`)
//
// Pure by design: `resolveConfig(env)` takes an env object so the server libs are
// unit-testable without SvelteKit. Routes call it with `process.env`.

import path from "node:path";

export const DEFAULT_GATEWAY_URL = "http://nas:4000";
export const DEFAULT_DATA = "/data";

function trimUrl(url) {
  return String(url).replace(/\/+$/, "");
}

export function resolveConfig(env = process.env) {
  const dataDir = env.GALLERY_DATA || DEFAULT_DATA;
  return {
    dataDir,
    dbPath: env.GALLERY_DB || path.join(dataDir, "reader.db"),
    imagesDir: env.GALLERY_IMAGES || path.join(dataDir, "images"),
    indexDir: env.GALLERY_INDEX_DIR || path.join(dataDir, "index"),
    // The embedded local index is the only backend gallery opens directly.
    indexBackend: (env.INDEX_BACKEND || "lancedb").toLowerCase(),
    litellmBaseUrl: trimUrl(env.LITELLM_BASE_URL || DEFAULT_GATEWAY_URL),
    litellmMasterKey: env.LITELLM_MASTER_KEY || null,
    // Overrides exist only for tests / re-pins; the record is authoritative.
    embeddingModelOverride: env.GALLERY_EMBED_MODEL || null,
    embeddingDimensionsOverride: env.GALLERY_EMBED_DIMENSIONS
      ? Number(env.GALLERY_EMBED_DIMENSIONS)
      : null,
  };
}

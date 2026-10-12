// Lazily-opened runtime: the read-only store, the embedded index, and the
// pinned embedding config. Startup checks (schema version, Lance binding,
// pinned dimensions) run here and fail loudly — a mismatch must not degrade
// silently.

import { resolveConfig } from "./config.js";
import { Store } from "./db.js";
import { openIndex } from "./index.js";
import { DEFAULT_EMBEDDING_MODEL } from "./schema.js";

/**
 * Build a runtime from an explicit config. Throws SchemaMismatchError /
 * IndexVersionError / Error when the record and the build disagree.
 */
export async function createRuntime(config = resolveConfig()) {
  const store = new Store(config.dbPath);
  let info;
  try {
    info = store.checkSchema();
  } catch (err) {
    store.close();
    throw err;
  }
  if (config.indexBackend !== "lancedb" && config.indexBackend !== "local") {
    store.close();
    throw new Error(
      `INDEX_BACKEND=${config.indexBackend} is not served by gallery; only the local ` +
        `LanceDB index is opened directly`,
    );
  }
  const model =
    config.embeddingModelOverride || info.embedding_model || DEFAULT_EMBEDDING_MODEL;
  const dimensions = config.embeddingDimensionsOverride || info.embedding_dimensions;
  if (!dimensions) {
    store.close();
    throw new Error(
      "embedding dimensionality is not pinned in schema_version (run `reader eval --pin N`)",
    );
  }
  const index = await openIndex(config.indexDir, { dimensions });
  return { config, store, index, model, dimensions, schema: info };
}

let _runtime = null;

/** Process-wide singleton. A failed open is NOT cached, so the server recovers. */
export function getRuntime() {
  if (!_runtime) {
    _runtime = createRuntime().catch((err) => {
      _runtime = null;
      throw err;
    });
  }
  return _runtime;
}

export async function closeRuntime() {
  if (!_runtime) return;
  try {
    const rt = await _runtime;
    rt.store.close();
  } finally {
    _runtime = null;
  }
}

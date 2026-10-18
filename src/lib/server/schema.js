// Vendored copy of the constants shared by the `reader` and `gallery` repos.
//
// Source of truth: `reader/src/reader/schema.py`. This file has no imports on
// purpose so it can be read anywhere. Both repos compare SCHEMA_VERSION against
// the `schema_version` table before touching the database; a bump in reader
// requires a matching bump + migration here.
//
// The contract between the two repos is DATA, not code: gallery never imports
// reader. It reads the SQLite record and the Lance index directory directly.

/** Version of the SQLite schema gallery was built against. */
export const SCHEMA_VERSION = 3;

/** Version of the embedding configuration stamped onto every vector row. */
export const EMBED_CONFIG_VERSION = "2";

/** The single Lance table (one namespace, a `kind` column). */
export const CHUNKS_NAMESPACE = "chunks";

/** The three kinds of index row. `text`/`concept` carry text (BM25); images do not. */
export const CHUNK_KINDS = ["text", "concept", "image"];

/** Candidate dimensionalities; the pinned one is recorded in `schema_version`. */
export const CANDIDATE_DIMENSIONS = [2048, 1536];

/**
 * The pinned LanceDB Node binding. The Lance format + Rust core are pinned per
 * binding version, so reader (Python) and gallery (Node) must agree — this is
 * enforced at startup alongside the schema check.
 */
export const LANCEDB_BINDING = "0.40.0";

/** Default embedding model id when the record has not pinned one. */
export const DEFAULT_EMBEDDING_MODEL = "cohere/embed-v5.0";

/** Raised when the database's recorded schema version does not match ours. */
export class SchemaMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "SchemaMismatchError";
  }
}

/** Raised when the Lance binding version on disk disagrees with ours. */
export class IndexVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = "IndexVersionError";
  }
}

/**
 * Index row ids are `<kind>:<record id>` (e.g. `text:12`, `concept:3`).
 * A bare value (no colon) is read as a `text` chunk id, matching reader.eval.
 */
export function parseIndexId(value) {
  const s = String(value);
  const i = s.indexOf(":");
  if (i < 0) return { kind: "text", id: Number(s) };
  return { kind: s.slice(0, i), id: Number(s.slice(i + 1)) };
}

export function indexId(kind, id) {
  return `${kind}:${id}`;
}

// The ONLY module that talks to LanceDB. Opened read-only (gallery never
// writes; `reader` owns housekeeping), queried directly — no reader HTTP
// surface. Hybrid BM25 + vector + RRF runs natively in the Node binding.
//
// Proven chain (@lancedb/lancedb 0.40.0, Node 24): see the lancedb-node-hybrid
// spike. `nearestTo(...).fullTextSearch(...).rerank(RRFReranker)` is the only
// route to hybrid; `_distance`/`_score` are selected explicitly because their
// auto-projection is deprecated.

import * as lancedb from "@lancedb/lancedb";

import { CHUNKS_NAMESPACE, IndexVersionError, LANCEDB_BINDING } from "./schema.js";

/** Columns gallery reads from the Lance table, per query shape. */
const BASE_COLUMNS = ["id", "kind", "text", "book_id", "page_id"];
// Auto-projection of score columns is deprecated, so they are selected
// explicitly — and only the ones the shape actually produces: a pure FTS query
// has no `_distance`, a pure vector query has no `_score`.
const HYBRID_COLUMNS = [...BASE_COLUMNS, "_distance", "_score"];
const VECTOR_COLUMNS = [...BASE_COLUMNS, "_distance"];
const FTS_COLUMNS = [...BASE_COLUMNS, "_score"];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function kindWhere(kinds) {
  if (!kinds || kinds.length === 0) return null;
  return `kind IN (${kinds.map(sqlString).join(",")})`;
}

export function assertBindingVersion(actual) {
  if (actual !== LANCEDB_BINDING) {
    throw new IndexVersionError(
      `@lancedb/lancedb ${actual} is loaded but the Lance binding is pinned to ${LANCEDB_BINDING} ` +
        `(reader writes the directory; the Lance format + Rust core are pinned per binding)`,
    );
  }
}

/** Open the derived index read-only. `dimensions` comes from `schema_version`. */
export async function openIndex(indexDir, { dimensions, table = CHUNKS_NAMESPACE } = {}) {
  assertBindingVersion(lancedb.__version || lancedb.version || LANCEDB_BINDING);
  // readConsistencyInterval 0 -> every read checks for updates from the writer.
  const db = await lancedb.connect(indexDir, { readConsistencyInterval: 0 });
  const tbl = await db.openTable(table);
  return new LanceIndex(tbl, { dimensions });
}

export class LanceIndex {
  constructor(table, { dimensions } = {}) {
    this.table = table;
    this.dimensions = dimensions;
    this._reranker = null;
  }

  async _rerank() {
    if (!this._reranker) {
      this._reranker = await lancedb.rerankers.RRFReranker.create();
    }
    return this._reranker;
  }

  async count() {
    return this.table.countRows();
  }

  /** Hybrid vector + BM25 retrieval with native RRF fusion. */
  async hybridSearch({ vector, text, kinds, topK = 30 } = {}) {
    const reranker = await this._rerank();
    let q = this.table
      .query()
      .nearestTo(vector)
      .fullTextSearch(text, { columns: "text" })
      .where(kindWhere(kinds) ?? undefined);
    q = q.rerank(reranker).select(HYBRID_COLUMNS).limit(topK);
    return q.toArray();
  }

  /** Vector-only ANN (e.g. the image gallery's "looks like" path). */
  async vectorSearch({ vector, kinds, topK = 30 } = {}) {
    let q = this.table.query().nearestTo(vector);
    const where = kindWhere(kinds);
    if (where) q = q.where(where);
    return q.select(VECTOR_COLUMNS).limit(topK).toArray();
  }

  /** BM25-only full-text search (no embedding hop needed). */
  async textSearch({ text, kinds, topK = 30 } = {}) {
    let q = this.table.query().fullTextSearch(text, { columns: "text" });
    const where = kindWhere(kinds);
    if (where) q = q.where(where);
    return q.select(FTS_COLUMNS).limit(topK).toArray();
  }
}

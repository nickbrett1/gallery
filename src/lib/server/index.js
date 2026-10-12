// The ONLY module that talks to LanceDB. Opened read-only (gallery never
// writes; `reader` owns housekeeping), queried directly — no reader HTTP
// surface. Hybrid BM25 + vector + RRF runs natively in the Node binding.
//
// Proven chain (@lancedb/lancedb 0.40.0, Node 24): see the lancedb-node-hybrid
// spike. `nearestTo(...).fullTextSearch(...).rerank(RRFReranker)` is the only
// route to hybrid (`.rerank` is unavailable on a pure FTS query, and
// `table.search(queryType)` cannot reach RRF).
//
// Two hard-won constraints on 0.40.0 (verified with the real chain, not the
// mock — see scripts/lance-smoke.mjs):
//   1. `.select()` is applied to the BASE table scan, before rerank. The
//      query pseudo-columns (`_distance` on vector, `_score` on fts) are NOT
//      base fields, so selecting them on a HYBRID query throws
//      "No field named _distance". Select base columns only — the fused plan
//      appends `_score` (BM25 branch) and `_relevance_score` (RRF) itself.
//   2. `.where(undefined)` throws ("Failed to convert ... Undefined into rust
//      type String"), so a filter is only applied when one actually exists.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import * as lancedb from "@lancedb/lancedb";

import { CHUNKS_NAMESPACE, IndexVersionError, LANCEDB_BINDING } from "./schema.js";

/** Base columns selectable on every query shape. */
const BASE_COLUMNS = ["id", "kind", "text", "book_id", "page_id"];
// Hybrid must select base columns only (see note 1): the fused plan adds
// `_score` + `_relevance_score` on its own. Single-branch queries may select
// their own pseudo-column.
const HYBRID_COLUMNS = BASE_COLUMNS;
const VECTOR_COLUMNS = [...BASE_COLUMNS, "_distance"];
const FTS_COLUMNS = [...BASE_COLUMNS, "_score"];

const require = createRequire(import.meta.url);

/**
 * The installed LanceDB Node binding version. The package does not surface a
 * version at runtime (`__version`/`version` are both undefined), so it is read
 * from the resolved entry point's package metadata.
 */
export function bindingVersion() {
  try {
    const entry = require.resolve("@lancedb/lancedb");
    const meta = JSON.parse(
      readFileSync(path.join(path.dirname(entry), "..", "package.json"), "utf8"),
    );
    return meta.version ?? null;
  } catch {
    return lancedb.__version ?? lancedb.version ?? null;
  }
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function kindWhere(kinds) {
  if (!kinds || kinds.length === 0) return null;
  return `kind IN (${kinds.map(sqlString).join(",")})`;
}

/** Apply the kind filter only when present — `.where(undefined)` throws. */
function applyKinds(query, kinds) {
  const where = kindWhere(kinds);
  return where ? query.where(where) : query;
}

export function assertBindingVersion(actual = bindingVersion()) {
  if (!actual) {
    throw new IndexVersionError(
      `could not determine the installed @lancedb/lancedb version; the Lance binding is pinned ` +
        `to ${LANCEDB_BINDING} and must be verified at startup`,
    );
  }
  if (actual !== LANCEDB_BINDING) {
    throw new IndexVersionError(
      `@lancedb/lancedb ${actual} is installed but the Lance binding is pinned to ${LANCEDB_BINDING} ` +
        `(reader writes the directory; the Lance format + Rust core are pinned per binding)`,
    );
  }
}

/**
 * The typed result shape the rest of the app consumes. `score` is the fused
 * RRF score when the plan produced one (`_relevance_score`), else the
 * single-branch score (`_score`); `distance` is present only on vector queries.
 */
export function shapeHit(row) {
  return {
    id: row.id,
    kind: row.kind,
    bookId: row.book_id ?? null,
    pageId: row.page_id ?? null,
    text: row.text ?? null,
    score: row._relevance_score ?? row._score ?? null,
    distance: row._distance ?? null,
  };
}

function shapeRows(rows) {
  return (rows || []).map(shapeHit);
}

/** Open the derived index read-only. `dimensions` comes from `schema_version`. */
export async function openIndex(indexDir, { dimensions, table = CHUNKS_NAMESPACE } = {}) {
  assertBindingVersion();
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
      // Async factory; RRF k defaults to 60.
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
    // nearestTo MUST come first, then fullTextSearch, then rerank.
    let q = applyKinds(
      this.table.query().nearestTo(vector).fullTextSearch(text, { columns: "text" }),
      kinds,
    );
    q = q.rerank(reranker).select(HYBRID_COLUMNS).limit(topK);
    return shapeRows(await q.toArray());
  }

  /** Vector-only ANN (e.g. the image gallery's "looks like" path). */
  async vectorSearch({ vector, kinds, topK = 30 } = {}) {
    let q = applyKinds(this.table.query().nearestTo(vector), kinds);
    return shapeRows(await q.select(VECTOR_COLUMNS).limit(topK).toArray());
  }

  /** BM25-only full-text search (no embedding hop needed). */
  async textSearch({ text, kinds, topK = 30 } = {}) {
    let q = applyKinds(this.table.query().fullTextSearch(text, { columns: "text" }), kinds);
    return shapeRows(await q.select(FTS_COLUMNS).limit(topK).toArray());
  }
}

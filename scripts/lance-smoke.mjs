// Verifies the app's read layer (src/lib/server/index.js) against a real Lance
// directory. Prefers the mounted reader dir; otherwise provisions a
// reader-SHAPED table (same columns/types + FTS index) in a temp dir.
//
//   node scripts/lance-smoke.mjs [LANCE_DIR]
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as lancedb from "@lancedb/lancedb";
import { openIndex } from "../src/lib/server/index.js";

const DIM = 2048;
function vec(seed) {
  const v = new Float32Array(DIM);
  let x = (seed >>> 0) || 1;
  for (let i = 0; i < DIM; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    v[i] = (x / 0xffffffff) * 2 - 1;
  }
  return v;
}

const ROWS = [
  { id: "text:1", vector: vec(1), kind: "text", text: "Wander climbs the colossus and strikes its sigil.", book_id: 1, page_id: 1 },
  { id: "text:2", vector: vec(2), kind: "text", text: "The great colossus of the Forbidden Lands.", book_id: 1, page_id: 2 },
  { id: "concept:1", vector: vec(3), kind: "concept", text: "Colossus", book_id: null, page_id: null },
  { id: "image:1", vector: vec(4), kind: "image", text: "", book_id: 1, page_id: 3 },
];

async function provision(dir) {
  const db = await lancedb.connect(dir);
  const tbl = await db.createTable("chunks", ROWS, { mode: "overwrite" });
  await tbl.createIndex("text", { config: lancedb.Index.fts() });
  try {
    await tbl.createIndex("vector", { config: lancedb.Index.ivfPq({ numPartitions: 1, numSubVectors: 8 }) });
  } catch (e) {
    console.log("[smoke] vector_idx skipped:", e.message.split("\n")[0]);
  }
}

const pkg = JSON.parse(await readFile(new URL("../node_modules/@lancedb/lancedb/package.json", import.meta.url), "utf8"));
console.log(`[smoke] @lancedb/lancedb package.json version: ${pkg.version}`);
console.log(`[smoke] __version=${JSON.stringify(lancedb.__version)} version=${JSON.stringify(lancedb.version)}`);

const dir = process.argv[2] || process.env.GALLERY_INDEX_DIR || "/data/index";
let tmp = null;
let source = "real";
if (existsSync(path.join(dir, "chunks.lance"))) {
  console.log(`[smoke] opening REAL reader dir: ${dir}`);
} else {
  source = "synthetic";
  console.log(`[smoke] real dir ${dir} absent — provisioning reader-shaped table`);
  tmp = mkdtempSync(path.join(tmpdir(), "lance-smoke-"));
  await provision(tmp);
}

async function attempt(label, fn) {
  try {
    const rows = await fn();
    console.log(`OK   ${label} -> ${rows.length} rows`);
    for (const r of rows.slice(0, 5)) {
      console.log("       " + JSON.stringify({
        id: r.id, kind: r.kind, book_id: r.book_id, page_id: r.page_id,
        _score: r._score ?? null, _distance: r._distance ?? null,
        score: r.score ?? null, distance: r.distance ?? null,
      }));
    }
  } catch (e) {
    console.log(`FAIL ${label} -> ${String(e.message).split("\n")[0].slice(0, 160)}`);
  }
}

const index = await openIndex(source === "real" ? dir : tmp, { dimensions: DIM });
console.log(`[smoke] source=${source} rowCount=${await index.count()}`);

const rer = await lancedb.rerankers.RRFReranker.create();
console.log("\n-- raw proven chain (select base cols, no kind filter) --");
await attempt("raw hybrid", () =>
  index.table.query().nearestTo(vec(1)).fullTextSearch("colossus", { columns: "text" })
    .rerank(rer).limit(10)
    .select(["id", "kind", "text", "book_id", "page_id"]).toArray());

console.log("\n-- app module --");
await attempt("LanceIndex.hybridSearch  (no kinds)", () => index.hybridSearch({ vector: vec(1), text: "colossus", topK: 10 }));
await attempt("LanceIndex.hybridSearch  (kinds=text,concept)", () => index.hybridSearch({ vector: vec(1), text: "colossus", kinds: ["text", "concept"], topK: 10 }));
await attempt("LanceIndex.vectorSearch  (kinds=image)", () => index.vectorSearch({ vector: vec(4), kinds: ["image"], topK: 10 }));
await attempt("LanceIndex.textSearch    (kinds=text)", () => index.textSearch({ text: "colossus", kinds: ["text"], topK: 10 }));

if (tmp) rmSync(tmp, { recursive: true, force: true });

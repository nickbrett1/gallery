// Search orchestration: embed the query, run hybrid retrieval on the local
// index, then enrich each hit back into the RECORD (SQLite) so every result
// carries a real citation. The index holds `<kind>:<id>` row ids and text only;
// the record is authoritative for titles, pages and offsets.

import { embedQuery } from "./embed.js";
import { parseIndexId } from "./schema.js";

export const SEARCH_MODES = ["hybrid", "vector", "text"];

export function parseKinds(value) {
  if (!value) return null;
  const parts = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "text" || s === "concept" || s === "image");
  return parts.length ? [...new Set(parts)] : null;
}

/** Enrich one index row into a citation-bearing result. */
export function enrichRow(store, row) {
  const { kind, id } = parseIndexId(row.id);
  const base = {
    indexId: row.id,
    kind,
    score: row.score ?? null,
    distance: row.distance ?? null,
  };
  if (kind === "text") {
    const chunk = store.getChunk(id);
    if (!chunk) return { ...base, missing: true };
    return {
      ...base,
      workKey: chunk.work_key,
      bookId: chunk.book_id,
      title: chunk.title,
      pageNo: chunk.page_no,
      chunkId: chunk.id,
      startOffset: chunk.start_offset,
      endOffset: chunk.end_offset,
      text: chunk.text,
      href: `/books/${chunk.book_id}#page-${chunk.page_no}`,
    };
  }
  if (kind === "concept") {
    const concept = store.getConcept(id);
    if (!concept) return { ...base, missing: true };
    return {
      ...base,
      conceptId: concept.id,
      name: concept.name,
      type: concept.type,
      description: concept.description,
      text: row.text ?? null,
      href: `/concepts/${concept.id}`,
    };
  }
  if (kind === "image") {
    const image = store.getImage(id);
    if (!image) return { ...base, missing: true };
    return {
      ...base,
      imageId: image.id,
      bookId: image.book_id,
      pageNo: image.page_no,
      mime: image.mime,
      kindLabel: image.kind,
      caption: image.caption,
      href: `/images?focus=${image.id}`,
    };
  }
  return { ...base, missing: true };
}

export function enrichRows(store, rows) {
  return (rows || []).map((row) => enrichRow(store, row)).filter((r) => !r.missing);
}

/**
 * Full query path. `embed`/`index` are injectable so tests never touch the
 * network or native code.
 */
export async function search(
  { config, store, index, model, dimensions },
  { query, kinds = null, topK = 30, mode = "hybrid" },
  { embed = embedQuery } = {},
) {
  const q = (query || "").trim();
  if (!q) return { query: q, mode, results: [] };

  let rows;
  if (mode === "text") {
    rows = await index.textSearch({ text: q, kinds, topK });
  } else if (mode === "vector") {
    const vector = await embed(q, { config, model, dimensions });
    rows = await index.vectorSearch({ vector, kinds, topK });
  } else {
    const vector = await embed(q, { config, model, dimensions });
    rows = await index.hybridSearch({ vector, text: q, kinds, topK });
  }
  return { query: q, mode, results: enrichRows(store, rows) };
}

/** Group results for the search screen: text hits by work, then models, then art. */
export function groupResults(results) {
  const text = [];
  const concepts = [];
  const images = [];
  for (const r of results) {
    if (r.kind === "text") text.push(r);
    else if (r.kind === "concept") concepts.push(r);
    else images.push(r);
  }
  const byWork = new Map();
  for (const r of text) {
    const key = r.workKey || `book:${r.bookId}`;
    if (!byWork.has(key)) {
      byWork.set(key, { workKey: key, bookId: r.bookId, title: r.title, hits: [] });
    }
    byWork.get(key).hits.push(r);
  }
  return { works: [...byWork.values()], concepts, images };
}

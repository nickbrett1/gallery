// Portrait lookup for the Constellation: the image nearest a concept's vector.
//
// N nodes = N queries, and portraits never change between ingests, so this is
// an in-process LRU keyed by concept id. A missing portrait degrades one node;
// it must never fail the screen.

import { parseIndexId } from "./schema.js";

const CACHE_LIMIT = 500;
const CACHE = new Map();

export async function portraitFor(rt, conceptId) {
  if (CACHE.has(conceptId)) return CACHE.get(conceptId);
  if (!rt.index?.getVector) return null;

  let portrait = null;
  try {
    const vector = await rt.index.getVector(`concept:${conceptId}`);
    if (vector) {
      const hits = await rt.index.vectorSearch({ vector, kinds: ["image"], topK: 1 });
      const ref = hits.length ? parseIndexId(hits[0].id) : null;
      if (ref?.kind === "image") portrait = { id: ref.id, src: `/thumb/${ref.id}` };
    }
  } catch {
    portrait = null;
  }

  if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(conceptId, portrait);
  return portrait;
}

/** Tests need a cold cache; production never calls this. */
export function clearPortraitCache() {
  CACHE.clear();
}

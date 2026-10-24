import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";
import { parseIndexId } from "$lib/server/schema.js";

/** How many adjacent plates the strip carries. */
const NEARBY = 12;

/**
 * The honest fallback when a plate's page has no displayable quote: the nearest
 * `text` chunk, labelled a passage. The record says `quote` only when there is
 * a real quote row above the display cut.
 */
async function nearestPassage(rt, imageId) {
  const vector = await rt.index.getVector(`image:${imageId}`);
  if (!vector) return null;
  const hits = await rt.index.vectorSearch({ vector, kinds: ["text"], topK: 1 });
  if (hits.length === 0) return null;
  const { id: chunkId } = parseIndexId(hits[0].id);
  const chunk = rt.store.getChunk(chunkId);
  if (!chunk) return null;
  return {
    kind: "passage",
    text: chunk.text,
    page_id: chunk.page_id,
    page_no: chunk.page_no,
    book_id: chunk.book_id,
    title: chunk.title,
    work_key: chunk.work_key,
    distance: hits[0].distance,
  };
}

/** The plates that sit closest to this one in the embedding space. */
async function nearbyPlates(rt, imageId) {
  const vector = await rt.index.getVector(`image:${imageId}`);
  if (!vector) return [];
  const hits = await rt.index.vectorSearch({ vector, kinds: ["image"], topK: NEARBY + 1 });
  const ids = hits
    .map((hit) => parseIndexId(hit.id))
    .filter((ref) => ref.kind === "image" && ref.id !== imageId)
    .map((ref) => ref.id)
    .slice(0, NEARBY);
  const byId = new Map(rt.store.imagesByIds(ids).map((img) => [img.id, img]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");

  try {
    const rt = await getRuntime();
    const image = rt.store.getImage(id);
    if (!image) throw error(404, "image not found");

    const { path, thumb, ...meta } = image;
    const book = image.book_id ? rt.store.getBook(image.book_id) : null;

    // Ranked, never dumped: the store filters below the display cut.
    const quotes = rt.store.quotesForImage(id, { limit: 3 });
    const chips = rt.store.conceptsForQuotes(quotes.map((q) => q.id));
    const quote = quotes.length
      ? {
          ...quotes[0],
          // `kind` on a quote row is the extractor's label (observation,
          // statement, author_voice); the surface label is separate so the UI
          // can say "quote" without losing why reader kept it.
          kind: "quote",
          quoteKind: quotes[0].kind,
          concepts: chips[quotes[0].id] ?? [],
        }
      : null;

    return {
      plate: meta,
      book,
      quote,
      passage: quote ? null : await nearestPassage(rt, id),
      nearby: await nearbyPlates(rt, id),
      checkpoint: (() => {
        const page = rt.store.pageForImage(id);
        return page?.page_id != null ? rt.store.quoteCheckpoint(page.page_id) : null;
      })(),
      error: null,
    };
  } catch (err) {
    if (err?.status === 404) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

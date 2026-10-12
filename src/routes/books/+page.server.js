import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    const rt = await getRuntime();
    // The cover is derived (first image in reading order) — no schema column.
    const books = rt.store
      .listBooks()
      .map((b) => ({ ...b, cover: rt.store.coverForBook(b.id) }));
    return {
      books,
      counts: rt.store.counts(),
      error: null,
    };
  } catch (err) {
    return { books: [], counts: null, error: String(err?.message || err) };
  }
}

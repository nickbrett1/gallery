import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    const rt = await getRuntime();
    return {
      books: rt.store.listBooks(),
      counts: rt.store.counts(),
      error: null,
    };
  } catch (err) {
    return { books: [], counts: null, error: String(err?.message || err) };
  }
}

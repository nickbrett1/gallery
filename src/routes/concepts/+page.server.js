import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    const rt = await getRuntime();
    return { concepts: rt.store.listConcepts({ limit: 300 }), error: null };
  } catch (err) {
    return { concepts: [], error: String(err?.message || err) };
  }
}

import { error, redirect } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** `/plate` — the drift entry: a weighted-random plate, no text input anywhere. */
/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    const rt = await getRuntime();
    const id = rt.store.randomImageId();
    if (id == null) throw error(404, "no plates in the record");
    throw redirect(307, `/plate/${id}`);
  } catch (err) {
    if (err?.status === 404 || err?.status === 307) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");
  try {
    const rt = await getRuntime();
    const book = rt.store.getBook(id);
    if (!book) throw error(404, "book not found");
    return {
      book,
      pages: rt.store.pagesForBook(id),
      images: rt.store.imagesForBook(id),
      error: null,
    };
  } catch (err) {
    if (err?.status === 404) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");
  try {
    const rt = await getRuntime();
    const image = rt.store.getImage(id);
    if (!image) throw error(404, "image not found");
    const book = image.book_id ? rt.store.getBook(image.book_id) : null;
    const { path, thumb, ...meta } = image;
    return { image: meta, book, error: null };
  } catch (err) {
    if (err?.status === 404) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

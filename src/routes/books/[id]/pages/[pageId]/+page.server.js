import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const pageId = Number(params.pageId);
  if (!Number.isInteger(pageId)) throw error(404, "not found");
  try {
    const rt = await getRuntime();
    const page = rt.store.getPage(pageId);
    if (!page) throw error(404, "page not found");
    const book = rt.store.getBook(page.book_id);
    return { page, book, error: null };
  } catch (err) {
    if (err?.status === 404) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

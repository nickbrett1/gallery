import { getRuntime } from "$lib/server/runtime.js";

const PAGE_SIZE = 60;

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
  const page = Math.max(0, Number(url.searchParams.get("page") || 0) || 0);
  const bookRaw = url.searchParams.get("book");
  const bookId = bookRaw ? Number(bookRaw) : null;
  const focus = url.searchParams.get("focus") ? Number(url.searchParams.get("focus")) : null;
  try {
    const rt = await getRuntime();
    const total = bookId != null ? rt.store.imagesForBook(bookId).length : rt.store.countImages();
    return {
      images: rt.store.listImages({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, bookId }),
      books: rt.store.listBooks(),
      bookId,
      focus,
      page,
      pageSize: PAGE_SIZE,
      total,
      error: null,
    };
  } catch (err) {
    return {
      images: [],
      books: [],
      bookId,
      focus,
      page,
      pageSize: PAGE_SIZE,
      total: 0,
      error: String(err?.message || err),
    };
  }
}

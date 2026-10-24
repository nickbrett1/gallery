import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";
import { parseWallCursor } from "$lib/server/db.js";

/** Tiles per page. Keyset-paged, so this is a hint, not an OFFSET. */
const PAGE_SIZE = 120;

/**
 * Group consecutive tiles by work. The wall is ordered by book, so a page can
 * only ever contain a contiguous run of works — grouping is a fold, not a sort,
 * and the sticky rails stay in reading order.
 */
function groupByWork(images, booksById) {
  const groups = [];
  for (const image of images) {
    const last = groups[groups.length - 1];
    if (last && last.bookId === image.book_id) {
      last.images.push(image);
    } else {
      const book = booksById.get(image.book_id) ?? null;
      groups.push({
        bookId: image.book_id,
        title: book?.title || book?.work_key || `work ${image.book_id}`,
        workKey: book?.work_key ?? null,
        images: [image],
      });
    }
  }
  return groups;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
  const bookRaw = url.searchParams.get("book");
  const bookId = bookRaw ? Number(bookRaw) : null;
  if (bookRaw && !Number.isInteger(bookId)) throw error(400, "bad book id");

  const after = url.searchParams.get("after");
  try {
    // Reject a malformed cursor before opening the record.
    parseWallCursor(after);

    const rt = await getRuntime();
    const page = rt.store.wallPage({ bookId, cursor: after, limit: PAGE_SIZE });
    const books = rt.store.listBooks();
    return {
      groups: groupByWork(page.images, new Map(books.map((b) => [b.id, b]))),
      books,
      bookId,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      pageSize: PAGE_SIZE,
      error: null,
    };
  } catch (err) {
    if (err instanceof TypeError) throw error(400, err.message);
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

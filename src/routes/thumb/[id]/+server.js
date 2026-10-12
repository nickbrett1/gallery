// Serve a thumbnail straight from the inline SQLite BLOB. Keeping this a
// single-DB read is deliberate (v5 §4.2): the gallery/search surface never
// touches the blob store for thumbs.

import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");
  const rt = await getRuntime();
  const row = rt.store.getImageThumb(id);
  if (!row || !row.thumb) throw error(404, "no thumbnail");
  const body = Buffer.isBuffer(row.thumb) ? row.thumb : Buffer.from(row.thumb);
  return new Response(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}

// Stream full-resolution image bytes from the content-addressed blob store.
// The store is a rebuildable cache; SQLite is the manifest. The path is
// verified to stay inside the mounted images dir before it is read.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");
  const rt = await getRuntime();
  const image = rt.store.getImage(id);
  if (!image) throw error(404, "image not found");

  const root = path.resolve(rt.config.imagesDir);
  const resolved = path.resolve(image.path);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw error(403, "refusing to serve a path outside the blob store");
  }

  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch {
    throw error(404, "blob missing from the store");
  }
  return new Response(bytes, {
    headers: {
      "content-type": image.mime || "application/octet-stream",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}

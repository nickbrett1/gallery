// Health endpoint used by the container HEALTHCHECK and the Homepage widget.
// The body is JSON (Homepage's `customapi` widget parses it) and always
// carries `status`, so the widget maps a field cleanly. The HTTP status stays
// 200 while the process is up: a missing/unpinned data mount is reported as
// `degraded`, which must not put the container into a restart loop.

import { getRuntime } from "$lib/server/runtime.js";
import { LANCEDB_BINDING, SCHEMA_VERSION } from "$lib/server/schema.js";

/** @type {import('./$types').RequestHandler} */
export async function GET() {
  const base = {
    status: "ok",
    schema: null,
    index: null,
    counts: null,
    detail: null,
  };
  try {
    const rt = await getRuntime();
    const info = rt.schema;
    const rows = await rt.index.count();
    return json({
      status: "ok",
      schema: {
        version: info.version,
        expected: SCHEMA_VERSION,
        pinned_dimensions: info.embedding_dimensions,
        embedding_model: info.embedding_model,
      },
      index: { backend: rt.config.indexBackend, lancedb_binding: LANCEDB_BINDING, rows },
      counts: rt.store.counts(),
      detail: null,
    });
  } catch (err) {
    return json({ ...base, status: "degraded", detail: String(err?.message || err) });
  }
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

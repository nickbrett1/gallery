// The query-embedding hop. gallery embeds the user's query with the SAME model
// and dimensionality reader wrote with (both read from `schema_version`), then
// hands the vector to the local index. This is the only network call on the
// read path, and it goes through the LiteLLM gateway like all our embedding.

import { DEFAULT_EMBEDDING_MODEL } from "./schema.js";

export class EmbedError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmbedError";
  }
}

/** Injectable transport for tests; the default posts to the gateway. */
async function defaultPost(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmbedError(`gateway ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}

/**
 * Embed one query string. `dimensions` is sent explicitly so ingest and query
 * cannot silently disagree — a mismatch degrades search rather than erroring.
 */
export async function embedQuery(text, { config, model, dimensions, post = defaultPost }) {
  const url = `${config.litellmBaseUrl}/v1/embeddings`;
  const headers = { "Content-Type": "application/json" };
  if (config.litellmMasterKey) {
    headers.Authorization = `Bearer ${config.litellmMasterKey}`;
  }
  const body = { model: model || DEFAULT_EMBEDDING_MODEL, input: [text] };
  if (dimensions) body.dimensions = dimensions;

  const json = await post(url, headers, body);
  const row = Array.isArray(json?.data) ? json.data[0] : null;
  if (!row || !Array.isArray(row.embedding)) {
    throw new EmbedError("gateway returned no embedding");
  }
  if (dimensions && row.embedding.length !== dimensions) {
    throw new EmbedError(
      `gateway returned ${row.embedding.length} dims, record pins ${dimensions}`,
    );
  }
  return row.embedding;
}

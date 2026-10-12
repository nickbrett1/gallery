import { getRuntime } from "$lib/server/runtime.js";
import { groupResults, parseKinds, search, SEARCH_MODES } from "$lib/server/search.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
  const q = (url.searchParams.get("q") || "").trim();
  const kinds = parseKinds(url.searchParams.get("kind"));
  const asked = url.searchParams.get("mode") || "hybrid";
  const mode = SEARCH_MODES.includes(asked) ? asked : "hybrid";
  const base = { q, kinds, mode };

  if (!q) return { ...base, grouped: null, error: null };

  try {
    const rt = await getRuntime();
    const { results } = await search(rt, { query: q, kinds, mode, topK: 30 });
    return { ...base, grouped: groupResults(results), error: null };
  } catch (err) {
    // The record/index is the app's data source; surface the reason instead of
    // a 500 so a misconfigured mount is obvious.
    return { ...base, grouped: null, error: String(err?.message || err) };
  }
}

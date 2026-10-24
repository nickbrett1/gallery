import { error, redirect } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";
import { layoutEgo } from "$lib/server/graph.js";
import { portraitFor } from "$lib/server/portraits.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");

  try {
    const rt = await getRuntime();
    const raw = rt.store.getConcept(id);
    if (!raw) throw error(404, "concept not found");

    // Merged concepts redirect to their representative; the id in the URL is
    // an alias, not a node of its own.
    const canonicalId = rt.store.resolveConceptId(id);
    if (canonicalId !== id) throw redirect(307, `/constellation/${canonicalId}`);

    const concept = {
      ...raw,
      mentions: rt.store.conceptMentions(canonicalId),
      portrait: await portraitFor(rt, canonicalId),
    };
    const neighbours = rt.store.conceptNeighbours(canonicalId, 12);
    const withPortraits = await Promise.all(
      neighbours.map(async (n) => ({ ...n, portrait: await portraitFor(rt, n.id) })),
    );

    return {
      concept,
      neighbours: withPortraits,
      graph: layoutEgo(concept, withPortraits),
      citations: rt.store.conceptCitations(canonicalId).length,
      error: null,
    };
  } catch (err) {
    if (err?.status === 404 || err?.status === 307) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

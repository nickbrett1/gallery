import { error } from "@sveltejs/kit";

import { getRuntime } from "$lib/server/runtime.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "not found");
  try {
    const rt = await getRuntime();
    // Collapse to the surviving node first — the record keeps every concept
    // (nothing is destroyed); `concept_resolution` is the derived view.
    const canonicalId = rt.store.resolveConceptId(id);
    const concept = rt.store.getConcept(canonicalId);
    if (!concept) throw error(404, "concept not found");
    return {
      concept,
      aliases: canonicalId === id ? [] : [rt.store.getConcept(id)?.name].filter(Boolean),
      surfaces: rt.store.conceptSurfaces(canonicalId),
      citations: rt.store.conceptCitations(canonicalId),
      related: rt.store.relatedConcepts(canonicalId),
      error: null,
    };
  } catch (err) {
    if (err?.status === 404) throw err;
    throw error(503, `data unavailable: ${err?.message || err}`);
  }
}

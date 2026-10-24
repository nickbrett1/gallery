import { redirect } from "@sveltejs/kit";

/**
 * The exploratory front door (design note §6).
 *
 * Deliberately a thin landing, not a rewrite: `/` keeps its tested, Lighthouse-
 * gated search box, and this sends a first-time visitor to a plate. Promoting
 * `/explore` to `/` later is a one-line route change; doing it the other way
 * round would mean rewriting a screen to serve a purpose it was not built for.
 *
 * @type {import('./$types').PageServerLoad}
 */
export function load() {
  throw redirect(307, "/plate");
}

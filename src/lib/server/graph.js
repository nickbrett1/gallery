// Pure layout maths for the Constellation. Kept out of the component and the
// route so it can be tested without a DOM: given a centre and its neighbours,
// where does every node sit and how strong is each edge?
//
// This is an ego-graph, one hop, always. A force-directed canvas over the whole
// corpus is a hairball that reads as noise and implies connectivity the record
// does not hold.

/** SVG-space dimensions of the stage (the component scales it by CSS). */
export const VIEW = { width: 820, height: 620 };

const CENTRE = { x: VIEW.width / 2, y: VIEW.height / 2 };
const RING = 236;

/** Node radius from mention count: sqrt, so one very common concept cannot swallow the ring. */
export function nodeRadius(mentions = 0, { min = 16, max = 40, at = 60 } = {}) {
  const clamped = Math.max(0, Math.min(mentions, at));
  return min + (max - min) * Math.sqrt(clamped / at);
}

/**
 * @param {{id:number,name:string,type:string,mentions:number,portrait:?object}} centre
 * @param {Array<{id:number,name:string,type:string,mentions:number,shared_pages:number,portrait:?object}>} neighbours
 */
export function layoutEgo(centre, neighbours = []) {
  const list = neighbours.slice(0, 12);
  const nodes = [
    {
      ...centre,
      // The centre is allowed to draw larger than the ring nodes.
      r: nodeRadius(centre.mentions, { min: 34, max: 56, at: 80 }),
      x: CENTRE.x,
      y: CENTRE.y,
      isCentre: true,
    },
  ];

  const maxShared = Math.max(1, ...list.map((n) => n.shared_pages || 0));

  list.forEach((n, i) => {
    // Start at the top and go clockwise, so the ring reads in a stable order.
    const angle = -Math.PI / 2 + (i / Math.max(1, list.length)) * Math.PI * 2;
    nodes.push({
      ...n,
      r: nodeRadius(n.mentions),
      x: CENTRE.x + Math.cos(angle) * RING,
      y: CENTRE.y + Math.sin(angle) * RING,
      isCentre: false,
    });
  });

  const edges = list.map((n) => ({
    from: centre.id,
    to: n.id,
    // Weak relations look weak: opacity is the share of the strongest edge.
    weight: (n.shared_pages || 0) / maxShared,
    sharedPages: n.shared_pages || 0,
  }));

  return { ...VIEW, centre: CENTRE, nodes, edges };
}

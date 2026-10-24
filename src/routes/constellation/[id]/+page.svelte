<script>
  import { goto } from "$app/navigation";

  let { data } = $props();

  let stage = $state(null);

  /** ←/→ cycle focus through the ring; `d` drifts to a random neighbour. */
  function onKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const links = [...(stage?.querySelectorAll("a.node") ?? [])];
    if (links.length === 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const at = links.indexOf(document.activeElement);
      const next = at === -1 ? (step > 0 ? 0 : links.length - 1) : (at + step + links.length) % links.length;
      links[next].focus();
    } else if (event.key === "d") {
      event.preventDefault();
      goto(`/constellation/${links[Math.floor(Math.random() * links.length)].dataset.id}`);
    }
  }

  const graph = $derived(data.graph);
  const centre = $derived(graph.nodes.find((n) => n.isCentre));
  const others = $derived(graph.nodes.filter((n) => !n.isCentre));

  /** Percent coordinates, so the stage scales with its container. */
  const pos = (n) => ({
    left: `${(n.x / graph.width) * 100}%`,
    top: `${(n.y / graph.height) * 100}%`,
    "--d": `${n.r * 2}px`,
  });
</script>

<svelte:window onkeydown={onKeydown} />

<h1>{data.concept.name}</h1>
<p class="muted small">
  <span class="pill">{data.concept.type}</span>
  {data.concept.mentions} mentions · {data.citations} citations
  {#if data.concept.description}· {data.concept.description}{/if}
</p>

<div class="stage" bind:this={stage} style={`aspect-ratio:${graph.width}/${graph.height}`}>
  <svg class="edges" viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true">
    {#each graph.edges as edge (edge.to)}
      {@const to = graph.nodes.find((n) => n.id === edge.to)}
      <line
        x1={graph.centre.x}
        y1={graph.centre.y}
        x2={to?.x ?? graph.centre.x}
        y2={to?.y ?? graph.centre.y}
        stroke="var(--accent-2)"
        stroke-width={1 + edge.weight * 2}
        stroke-opacity={0.12 + edge.weight * 0.5}
        data-shared-pages={edge.sharedPages}
      />
    {/each}
  </svg>

  {#each graph.nodes as node (node.id)}
    {#if node.isCentre}
      <div class="node centre" style={pos(node)}>
        {#if node.portrait}
          <img src={node.portrait.src} alt="" loading="lazy" />
        {:else}
          <span class="initials" aria-hidden="true">{node.name.slice(0, 1)}</span>
        {/if}
        <span class="label">{node.name}</span>
      </div>
    {:else}
      <a class="node" style={pos(node)} href={`/constellation/${node.id}`} data-id={node.id} title={`${node.name} · ${node.shared_pages} shared page(s)`}>
        {#if node.portrait}
          <img src={node.portrait.src} alt="" loading="lazy" />
        {:else}
          <span class="initials" aria-hidden="true">{node.name.slice(0, 1)}</span>
        {/if}
        <span class="label">{node.name}</span>
      </a>
    {/if}
  {/each}
</div>

{#if others.length === 0}
  <p class="muted">No neighbours yet — this concept has no page shared with another concept.</p>
{:else}
  <p class="muted small">
    Edges mean <strong>appears with</strong>: co-occurrence on the same page, weighted by how
    many pages. The record holds no typed relations, so a weak edge looks weak.
  </p>
{/if}

<p class="small"><a href={`/concepts/${data.concept.id}`}>all citations for {data.concept.name} →</a></p>

<style>
  .stage {
    position: relative;
    width: 100%;
    max-width: 820px;
    margin: 14px auto;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: radial-gradient(circle at 50% 50%, #191d26 0%, var(--bg) 70%);
    overflow: hidden;
  }
  .edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .node {
    position: absolute;
    width: var(--d);
    height: var(--d);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--ink);
    overflow: visible;
  }
  .node img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
    opacity: 0.85;
  }
  .node.centre {
    border: 2px solid var(--accent);
    box-shadow: 0 0 24px rgb(110 168 254 / 0.25);
  }
  a.node:hover,
  a.node:focus-visible {
    border-color: var(--accent);
    text-decoration: none;
  }
  .initials {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .label {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.72rem;
    color: var(--ink);
    background: rgb(20 22 26 / 0.85);
    padding: 1px 5px;
    border-radius: 4px;
    pointer-events: none;
  }
</style>

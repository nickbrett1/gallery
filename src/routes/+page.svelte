<script>
  let { data } = $props();
  const allKinds = [
    { value: "text", label: "Text" },
    { value: "concept", label: "Concepts" },
    { value: "image", label: "Art" },
  ];
  // One honest label per index kind. The kind filter mixes text + art (wanted
  // on search); the badge is how a mixed result list stays legible.
  const kindLabels = { text: "text", concept: "concept", image: "art" };
  function kindLabel(kind) {
    return kindLabels[kind] || kind || "result";
  }
</script>

<h1>Search</h1>
<p class="muted small">
  One box, hybrid vector + keyword search over the corpus. Every result cites a page.
</p>

<form method="GET" action="/">
  <div class="searchbar">
    <input
      type="search"
      name="q"
      value={data.q}
      placeholder="e.g. the final boss's design sheet"
    />
    <button type="submit">Search</button>
  </div>
  <div class="filters">
    <span>Kinds:</span>
    {#each allKinds as k (k.value)}
      <label>
        <input
          type="checkbox"
          name="kind"
          value={k.value}
          checked={!data.kinds || data.kinds.includes(k.value)}
        />
        {k.label}
      </label>
    {/each}
    <label>
      <input type="checkbox" name="mode" value="text" checked={data.mode === "text"} />
      keyword only (skip embedding)
    </label>
  </div>
</form>

{#if data.error}
  <div class="notice error">
    <strong>Data unavailable.</strong> {data.error}
    <div class="small">Check that GALLERY_DATA is mounted and the schema is pinned.</div>
  </div>
{/if}

{#if data.grouped}
  {#if data.grouped.works.length === 0 && data.grouped.concepts.length === 0 && data.grouped.images.length === 0}
    <div class="notice">No results for “{data.q}”.</div>
  {/if}

  {#each data.grouped.works as work (work.workKey)}
    <h2>{work.title || work.workKey}</h2>
    {#each work.hits as hit (hit.indexId ?? hit.href)}
      <article class="card">
        <h3>
          <span class="pill kind kind-{hit.kind}" data-kind={hit.kind}>{kindLabel(hit.kind)}</span>
          <a href={hit.href}>{hit.title || hit.workKey} — page {hit.pageNo}</a>
        </h3>
        <div class="cite">
          {hit.workKey} · chars {hit.startOffset}–{hit.endOffset}
          {#if hit.score != null}· score {Number(hit.score).toFixed(3)}{/if}
        </div>
        <p class="quote">{hit.text}</p>
      </article>
    {/each}
  {/each}

  {#if data.grouped.concepts.length}
    <h2>Concepts</h2>
    {#each data.grouped.concepts as c (c.conceptId ?? c.href)}
      <article class="card">
        <h3>
          <span class="pill kind kind-concept" data-kind="concept">concept</span>
          <a href={c.href}>{c.name}</a> <span class="pill">{c.type}</span>
        </h3>
        {#if c.description}<p class="muted">{c.description}</p>{/if}
      </article>
    {/each}
  {/if}

  {#if data.grouped.images.length}
    <h2>Art</h2>
    <div class="grid">
      {#each data.grouped.images as img (img.imageId)}
        <a class="tile" href={img.href}>
          <img src={`/thumb/${img.imageId}`} alt={`page ${img.pageNo} art`} loading="lazy" />
          <div class="meta">
            <span class="pill kind kind-image" data-kind="image">art</span>
            page {img.pageNo} · {img.kindLabel}
          </div>
        </a>
      {/each}
    </div>
  {/if}
{/if}

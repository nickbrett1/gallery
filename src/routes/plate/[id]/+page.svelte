<script>
  import { goto } from "$app/navigation";

  let { data } = $props();

  const plate = $derived(data.plate);
  const quote = $derived(data.quote);
  const passage = $derived(data.passage);
  const nearby = $derived(data.nearby ?? []);

  /** ← / → drift to an adjacent plate (the strip order is distance order). */
  function onKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (nearby.length === 0) return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = nearby[(step + nearby.length) % nearby.length];
    if (next) goto(`/plate/${next.id}`);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="plate">
  <figure class="plate-art">
    <img
      src={`/raw/${plate.id}`}
      alt={plate.caption || `plate ${plate.id}`}
      onerror={(event) => {
        // The blob store may not be mounted; fall back to the inline thumbnail.
        event.currentTarget.src = `/thumb/${plate.id}`;
      }}
    />
    {#if plate.caption}<figcaption class="muted small">{plate.caption}</figcaption>{/if}
  </figure>

  <div class="plate-text">
    {#if quote}
      <blockquote class="quote">{quote.text}</blockquote>
      <p class="cite small muted">
        quote · {quote.quoteKind}
        {#if data.book}
          · <a href={`/books/${data.book.id}#page-${quote.page_no}`}>{data.book.title || data.book.work_key}</a>
        {/if}
        · p.{quote.page_no} · score {quote.score.toFixed(2)}
      </p>
      {#if quote.concepts.length}
        <p class="chips">
          {#each quote.concepts as concept (concept.id)}
            <a class="pill" href={`/concepts/${concept.id}`}>{concept.name}</a>
          {/each}
        </p>
      {/if}
    {:else if passage}
      <blockquote class="quote">{passage.text}</blockquote>
      <p class="cite small muted">
        passage · not a quote
        {#if passage.title}
          · <a href={`/books/${passage.book_id}#page-${passage.page_no}`}>{passage.title}</a>
        {/if}
        · p.{passage.page_no}
      </p>
    {:else}
      <p class="muted">
        No quote or passage for this plate yet.
        {#if data.checkpoint}The extractor ran on its page but kept nothing above the cut.{/if}
      </p>
    {/if}

    <p class="small muted">
      {#if data.book}
        <a href={`/books/${data.book.id}`}>{data.book.title || data.book.work_key}</a> ·
      {/if}
      p.{plate.page_no ?? "—"} · <span class="pill">{plate.kind}</span>
      {#if plate.has_thumb === 0}<span class="muted"> · thumbnail missing</span>{/if}
    </p>
    <p class="small"><a href={`/image/${plate.id}`}>full record →</a></p>
  </div>
</section>

<h2>Nearby plates <span class="muted small">· use ← →</span></h2>
{#if nearby.length}
  <ul class="strip">
    {#each nearby as other (other.id)}
      <li>
        <a href={`/plate/${other.id}`}>
          <img src={`/thumb/${other.id}`} alt={other.caption || `plate ${other.id}`} loading="lazy" />
          <span class="small muted">p.{other.page_no ?? "—"}</span>
        </a>
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted small">No adjacent plates — this image has no vector in the index.</p>
{/if}

<style>
  .plate {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }
  @media (max-width: 800px) {
    .plate {
      grid-template-columns: 1fr;
    }
  }
  .plate-art {
    margin: 0;
  }
  .plate-art img {
    width: 100%;
    height: auto;
    border-radius: 12px;
    background: var(--panel);
    display: block;
  }
  .plate-text {
    border-left: 2px solid var(--line);
    padding-left: 16px;
  }
  .quote {
    margin: 0 0 8px;
    font-size: 1.15rem;
    line-height: 1.45;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }
  .strip {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
  .strip img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 8px;
    background: var(--panel);
    display: block;
  }
  .strip a {
    display: block;
  }
</style>

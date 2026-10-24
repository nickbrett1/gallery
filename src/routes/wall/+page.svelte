<script>
  let { data } = $props();

  const qs = (params) => {
    const url = new URL("http://x");
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const s = url.search;
    return s === "?" ? "" : s;
  };
</script>

<h1>Wall</h1>
<p class="muted small">
  {#if data.bookId}
    One work, in reading order ·
    <a href="/wall">all works</a>
  {:else}
    Every plate in the record, in reading order · click one to open it.
  {/if}
</p>

{#each data.groups as group (group.bookId)}
  <section class="work">
    <h2 class="rail">
      <a href={`/books/${group.bookId}`}>{group.title}</a>
      <span class="muted small">· {group.images.length} shown</span>
    </h2>
    <ul class="grid">
      {#each group.images as image (image.id)}
        <li>
          <a
            class="tile"
            href={`/plate/${image.id}`}
            data-image-id={image.id}
            data-cursor={`${image.book_id}:${image.page_no ?? 0}:${image.id}`}
            title={`page ${image.page_no ?? "—"}`}
          >
            <img src={`/thumb/${image.id}`} alt={image.caption || `plate ${image.id} on page ${image.page_no ?? "—"}`} loading="lazy" decoding="async" />
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/each}

{#if data.groups.length === 0}
  <p class="muted">No plates here yet.</p>
{/if}

{#if data.hasMore}
  <p class="more">
    <a href={`/wall${qs({ book: data.bookId, after: data.nextCursor })}`}>more →</a>
  </p>
{:else if data.groups.length > 0}
  <p class="muted small">end of the wall</p>
{/if}

<style>
  .work {
    margin-bottom: 18px;
  }
  /* The work heading is the only chrome; it rides along while its run lasts. */
  .rail {
    position: sticky;
    top: 49px; /* below the site header */
    z-index: 1;
    margin: 0 0 8px;
    padding: 6px 0;
    background: var(--bg);
    font-size: 0.95rem;
    border-bottom: 1px solid var(--line);
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }
  .tile {
    display: block;
    /* Offscreen tiles cost nothing to lay out (no JS masonry, no library). */
    content-visibility: auto;
    contain-intrinsic-size: 140px 105px;
  }
  .tile img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .tile:hover img,
  .tile:focus-visible img {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .more {
    margin: 18px 0 40px;
  }
</style>

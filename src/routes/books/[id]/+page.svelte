<script>
  let { data } = $props();
</script>

<h1>{data.book.title || data.book.work_key}</h1>
<p class="muted small">
  {data.book.author ? `${data.book.author} · ` : ""}{data.book.format} ·
  {data.pages.length} pages · {data.images.length} images
</p>

{#if data.images.length}
  <h2>Art</h2>
  <div class="grid">
    {#each data.images as img}
      <a class="tile" href={`/image/${img.id}`}>
        <img src={`/thumb/${img.id}`} alt={`page ${img.page_no ?? "?"} image`} loading="lazy" />
        <div class="meta">page {img.page_no ?? "—"} · {img.kind}{img.caption ? ` · ${img.caption}` : ""}</div>
      </a>
    {/each}
  </div>
{/if}

<h2>Pages</h2>
{#each data.pages as page}
  <details class="page" id={`page-${page.page_no}`}>
    <summary>
      Page {page.page_no} · {page.chars} chars{page.scanned ? " · scanned" : ""}
    </summary>
    <div class="small">
      <a href={`/books/${data.book.id}/pages/${page.id}`}>open page text</a>
    </div>
  </details>
{/each}

<script>
  let { data } = $props();
</script>

<h1>{data.book.title || data.book.work_key}</h1>
<p class="muted small">
  {data.book.author ? `${data.book.author} · ` : ""}{data.book.format} ·
  {data.pages.length} pages · {data.images.length} images
</p>

{#if data.cover}
  <a class="cover-hero" href={`/image/${data.cover.id}`} aria-label="cover">
    <img src={`/thumb/${data.cover.id}`} alt={`${data.book.title || data.book.work_key} cover`} />
  </a>
{/if}

{#if data.images.length}
  <h2>Art</h2>
  <div class="grid">
    {#each data.images as img (img.id)}
      <div class="tile" id={`image-${img.id}`}>
        <a href={img.page_no != null ? `/books/${data.book.id}#page-${img.page_no}` : `/image/${img.id}`}>
          <img src={`/thumb/${img.id}`} alt={`page ${img.page_no ?? "?"} image`} loading="lazy" />
        </a>
        <div class="meta">
          page {img.page_no ?? "—"} · {img.kind}{img.caption ? ` · ${img.caption}` : ""}
          · <a href={`/image/${img.id}`}>open</a>
        </div>
      </div>
    {/each}
  </div>
{/if}

<h2>Pages</h2>
{#each data.pages as page (page.id)}
  <details class="page" id={`page-${page.page_no}`}>
    <summary>
      Page {page.page_no} · {page.chars} chars{page.scanned ? " · scanned" : ""}
    </summary>
    <div class="small">
      <a href={`/books/${data.book.id}/pages/${page.id}`}>open page text</a>
    </div>
  </details>
{/each}

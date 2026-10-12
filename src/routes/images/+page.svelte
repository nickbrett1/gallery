<script>
  let { data } = $props();
  let lastPage = $derived(Math.max(0, Math.ceil(data.total / data.pageSize) - 1));
</script>

<h1>Image gallery</h1>
{#if data.error}
  <div class="notice error"><strong>Data unavailable.</strong> {data.error}</div>
{:else}
  <form method="GET" action="/images" class="filters">
    <label>
      Book:
      <select name="book">
        <option value="">all</option>
        {#each data.books as b}
          <option value={b.id} selected={data.bookId === b.id}>{b.title || b.work_key}</option>
        {/each}
      </select>
    </label>
    <button type="submit" class="btn ghost">Filter</button>
  </form>

  <p class="muted small">{data.total} images{data.bookId ? " in this book" : ""}.</p>

  <div class="grid">
    {#each data.images as img}
      <div class="tile" style={data.focus === img.id ? "outline:2px solid var(--accent)" : ""}>
        <a href={`/image/${img.id}`}>
          <img src={`/thumb/${img.id}`} alt={`page ${img.page_no ?? "?"} art`} loading="lazy" />
        </a>
        <div class="meta">
          {#if img.book_id}<a href={`/books/${img.book_id}#page-${img.page_no}`}>page {img.page_no ?? "—"}</a>{:else}page {img.page_no ?? "—"}{/if}
          · {img.kind}{img.caption ? ` · ${img.caption}` : ""}
        </div>
      </div>
    {/each}
  </div>

  {#if data.total > data.pageSize}
    <p class="filters">
      {#if data.page > 0}
        <a class="btn ghost" href={`/images?page=${data.page - 1}${data.bookId ? `&book=${data.bookId}` : ""}`}>← prev</a>
      {/if}
      page {data.page + 1} of {lastPage + 1}
      {#if data.page < lastPage}
        <a class="btn ghost" href={`/images?page=${data.page + 1}${data.bookId ? `&book=${data.bookId}` : ""}`}>next →</a>
      {/if}
    </p>
  {/if}
{/if}

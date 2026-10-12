<script>
  let { data } = $props();
</script>

<h1>Books</h1>

{#if data.error}
  <div class="notice error"><strong>Data unavailable.</strong> {data.error}</div>
{:else}
  {#if data.counts}
    <p class="muted small">
      {data.counts.books} works · {data.counts.pages} pages · {data.counts.chunks} chunks ·
      {data.counts.concepts} concepts · {data.counts.images} images
    </p>
  {/if}
  <table>
    <thead>
      <tr><th>Title</th><th>Author</th><th>Format</th><th></th></tr>
    </thead>
    <tbody>
      {#each data.books as book}
        <tr>
          <td><a href={`/books/${book.id}`}>{book.title || book.work_key}</a></td>
          <td class="muted">{book.author || "—"}</td>
          <td><span class="pill">{book.format}</span></td>
          <td class="cite">{book.work_key}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

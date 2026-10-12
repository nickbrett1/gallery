<script>
  let { data } = $props();
</script>

<h1>Image {data.image.id}</h1>
<p class="muted small">
  {#if data.book}
    <a href={`/books/${data.book.id}#page-${data.image.page_no}`}>{data.book.title || data.book.work_key}</a> ·
  {/if}
  page {data.image.page_no ?? "—"} ·
  <span class="pill">{data.image.kind}</span>
  {data.image.w && data.image.h ? `${data.image.w}×${data.image.h}` : ""}
  {data.image.bytes ? `· ${(data.image.bytes / 1024).toFixed(0)} KB` : ""}
</p>
{#if data.image.caption}<p>{data.image.caption}</p>{/if}
<p><img src={`/raw/${data.image.id}`} alt={data.image.caption || "extracted art"} style="max-width:100%;border-radius:10px" /></p>
<p class="cite">sha256 {data.image.sha256}</p>

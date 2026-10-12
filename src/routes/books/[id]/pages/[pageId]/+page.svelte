<script>
  let { data } = $props();
</script>

<p class="small"><a href={`/books/${data.page.book_id}`}>← {data.book?.title || "book"}</a></p>
<h1>Page {data.page.page_no}</h1>
<p class="muted small">
  {data.book?.title || ""}{data.page.scanned ? " · scanned page (little or no embedded text)" : ""}
</p>
<pre class="page-text">{data.page.text}</pre>

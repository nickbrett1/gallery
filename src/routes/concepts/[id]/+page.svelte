<script>
  let { data } = $props();
</script>

<h1>{data.concept.name} <span class="pill">{data.concept.type}</span></h1>
{#if data.aliases.length}
  <p class="muted small">also known as: {data.aliases.join(", ")}</p>
{/if}
{#if data.concept.description}
  <p>{data.concept.description}</p>
{/if}
<p class="small"><a href={`/constellation/${data.concept.id}`}>constellation →</a></p>

<h2>Surface forms</h2>
<p>
  {#each data.surfaces as s}
    <span class="pill">{s.surface}</span>
  {/each}
</p>

{#if data.related.length}
  <h2>Appears with</h2>
  <p>
    {#each data.related as r}
      <a class="pill" href={`/concepts/${r.id}`}>{r.name}</a>
    {/each}
  </p>
{/if}

<h2>Citations ({data.citations.length})</h2>
{#each data.citations as c}
  <article class="card">
    <h3>
      <a href={`/books/${c.book_id}#page-${c.page_no}`}>
        {c.title || c.work_key} — page {c.page_no}
      </a>
    </h3>
    <div class="cite">“{c.surface}” · chars {c.start_offset}–{c.end_offset}</div>
  </article>
{:else}
  <p class="muted">No citations recorded.</p>
{/each}

<script>
  let { data } = $props();
</script>

<h1>Concepts</h1>
{#if data.error}
  <div class="notice error"><strong>Data unavailable.</strong> {data.error}</div>
{:else}
  <p class="muted small">{data.concepts.length} concepts, most-cited first.</p>
  <table>
    <thead><tr><th>Concept</th><th>Type</th><th>Mentions</th></tr></thead>
    <tbody>
      {#each data.concepts as c}
        <tr>
          <td><a href={`/concepts/${c.id}`}>{c.name}</a></td>
          <td><span class="pill">{c.type}</span></td>
          <td class="muted">{c.mentions}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

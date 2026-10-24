<script>
  import "../app.css";
  let { children } = $props();
</script>

<header class="site-header">
  <a class="brand" href="/">
    <img src="/favicon.svg" alt="" class="brand-icon" width="22" height="22" />
    <span>gallery</span>
  </a>
  <nav>
    <a href="/">Search</a>
    <a href="/books">Books</a>
    <a href="/concepts">Concepts</a>
    <a href="/images">Images</a>
    <a href="/plate">Plate</a>
  </nav>
</header>

<main>
  {@render children()}
</main>

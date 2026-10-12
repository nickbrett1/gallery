<script>
  import "../app.css";
  let { children } = $props();
</script>

<header class="site-header">
  <a class="brand" href="/">gallery</a>
  <nav>
    <a href="/">Search</a>
    <a href="/books">Books</a>
    <a href="/concepts">Concepts</a>
    <a href="/images">Images</a>
  </nav>
</header>

<main>
  {@render children()}
</main>

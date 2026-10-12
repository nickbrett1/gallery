// Lighthouse CI config for gallery.
//
// gallery is built with @sveltejs/adapter-node, so `build/` is a Node server
// (build/index.js), not a directory of static HTML. LHCI's staticDistDir mode
// therefore finds no files ("No URLs provided to collect and no HTML files
// found in staticDistDir"), so instead we start the built server and audit it
// over HTTP.
module.exports = {
  ci: {
    collect: {
      startServerCommand: "node build",
      // adapter-node prints this once the HTTP listener is up. The home page
      // renders even with no data mounted (the search loader degrades to an
      // error notice), so the audit always has a 200 to measure.
      startServerReadyPattern: "Listening on",
      startServerReadyTimeout: 30000,
      url: ["http://localhost:3000/"],
      numberOfRuns: 1,
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};

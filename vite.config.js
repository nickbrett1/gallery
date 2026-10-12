import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  // Native addons cannot be bundled: keep them external so Vite leaves the
  // `.node` binaries and their platform packages alone. They must be present
  // in the runtime image (the Dockerfile copies a pruned node_modules).
  ssr: {
    external: ["@lancedb/lancedb", "better-sqlite3"],
  },
  optimizeDeps: {
    exclude: ["@lancedb/lancedb", "better-sqlite3"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test-setup.js"],
    reporter: ["default", "junit"],
    outputFile: {
      junit: "./reports/junit.xml",
    },
    coverage: {
      reporter: ["lcov", "text"],
      // UI route components are exercised by the smoke test and by Lighthouse
      // CI, not unit tests; the native index module has no hermetic unit path.
      exclude: [
        "src/routes/**/*.svelte",
        "src/routes/**/+*.js",
        // Native LanceDB reader: opened against a real directory, covered by the
        // integration script, not by hermetic unit tests.
        "src/lib/server/index.js",
        "tests/**",
        "build/**",
        ".svelte-kit/**",
        "**/*.config.*",
      ],
      thresholds: {
        statements: 80,
        branches: 50,
        functions: 80,
        lines: 80,
      },
    },
  },
});

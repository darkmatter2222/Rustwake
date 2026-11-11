import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the built index.html works under a subpath route
  // (for example /rustwake/) as well as at a domain root: the emitted links
  // become ./assets/... instead of the absolute /assets/... that a root-hosted
  // build produces.
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      output: {
        // E3: the static data-table modules (audio cue/variant tables, the authored sprite
        // part table and the three pure-data content tables: the string table, the tuning/
        // blueprint table and the research tree) move to their own `tables` chunk, which
        // keeps the entry chunk under its pinned byte ceiling. Same module graph, no new
        // runtime dependency - every one of them is still a static import of the entry
        // graph, so Rollup just emits one extra preloaded sibling - and `base: "./"` still
        // emits relative ./assets/... links for the subpath-safe worker import as well.
        manualChunks(id: string): string | null {
          if (
            id.includes("/game/audio/audio.") ||
            id.includes("/game/renderer/sprites.") ||
            id.includes("/game/content/strings.") ||
            id.includes("/game/content/defs.") ||
            id.includes("/game/content/research.")
          ) {
            return "tables";
          }
          return null;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // L-2: the stylesheet has to be *evaluated* so a `?raw` import hands the test the
    // real declarations - with the default stub they come back empty and the cascade
    // for the chrome rows (`.status-line`, `.objective__row`) cannot be inspected.
    css: true,
  },
});

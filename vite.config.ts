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
        // E3: the two static data-table modules (audio cue/variant tables plus the
        // authored sprite part table) move to their own `tables` chunk, which keeps the
        // entry chunk under its pinned byte ceiling. Same module graph, no new runtime
        // dependency, and `base: "./"` still emits relative ./assets/... links for the
        // subpath-safe worker import as well.
        manualChunks(id: string): string | null {
          if (id.includes("/game/audio/audio.") || id.includes("/game/renderer/sprites.")) {
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
  },
});

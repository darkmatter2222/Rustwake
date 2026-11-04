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
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});

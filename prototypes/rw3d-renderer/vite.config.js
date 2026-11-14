import { defineConfig } from "vite";

// Ports 4300+ per dispatch: legacy preview servers occupy 4164-4198/5161/8462.
export default defineConfig({
  base: "./",
  server: { port: 4300, strictPort: true },
  preview: { port: 4310, strictPort: true },
  build: { target: "es2022", sourcemap: false },
});

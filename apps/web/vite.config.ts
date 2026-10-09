import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// DECISIONS.md: SharedArrayBuffer requires cross-origin isolation from day 1.
export default defineConfig({
  plugins: [vue()],
  // onnxruntime-web (Magic Sequence's pro analysis) finds its .wasm with new URL(..., import.meta.url):
  // pre-bundling would move the module away from the file, and its threads load the module itself,
  // which needs the analysis worker built as an ES module so the runtime stays its own chunk.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  worker: { format: "es" },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/api": "http://localhost:8000",
      "/sanctum": "http://localhost:8000",
    },
  },
});

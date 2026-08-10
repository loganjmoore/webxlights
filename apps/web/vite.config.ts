import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// DECISIONS.md: SharedArrayBuffer requires cross-origin isolation from day 1.
export default defineConfig({
  plugins: [vue()],
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

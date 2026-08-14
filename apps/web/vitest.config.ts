import { defineConfig } from "vitest/config";

// apps/web had no test runner at all, so its pure logic - the parts that aren't components -
// went unchecked. These are the files that decide what gets rendered and what gets saved, which
// is exactly where a silent mistake reaches the yard.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
  resolve: { alias: { "@webxlights/engine": new URL("../../packages/engine/src/index.ts", import.meta.url).pathname } },
});

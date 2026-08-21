// Lets plain Node import this monorepo's TypeScript the way Vite does.
//
// The packages use extensionless relative imports ("./isf") because Vite and vitest resolve
// them; Node's ESM loader will not, and Node's own type-stripping refuses to guess extensions.
// This hook retries a failed resolution with ".ts" and "/index.ts" appended - just enough for
// the harness to import the app's real shader-host module instead of a copy of it.
//
// Imported for its side effect: `import "./tsResolve.mjs"` before any dynamic import of a .ts
// file. It has to be the *evaluated-first* module, which is why check.mjs dynamic-imports
// everything TypeScript-adjacent rather than static-importing it.

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        for (const suffix of [".ts", "/index.ts"]) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next spelling
          }
        }
      }
      throw err;
    }
  },
});

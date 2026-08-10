import js from "@eslint/js";
import tseslint from "typescript-eslint";

// apps/web has its own eslint.config.js (adds eslint-plugin-vue); this one covers packages/*.
export default tseslint.config(
  { ignores: ["apps/**", "**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

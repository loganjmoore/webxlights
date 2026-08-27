// The committed builtin-shaders.json must never drift from the shaders it was baked from.
//
// This is the whole safety of the shipping mechanism. `packages/` is not in the runtime image,
// so the JSON is the only thing production can read - if someone edits a .fs file and forgets to
// re-bake, the app ships the previous version of the library and nothing anywhere says so.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bake } from "./bake-builtins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "..", "apps", "api", "database", "data", "builtin-shaders.json");

test("the committed builtin-shaders.json is in sync with packages/shaders/library", () => {
  assert.ok(existsSync(OUT), "builtin-shaders.json is missing - run node tools/shader-check/bake-builtins.mjs");
  const committed = readFileSync(OUT, "utf8");
  const rebuilt = JSON.stringify(bake(), null, 2) + "\n";
  assert.equal(
    committed,
    rebuilt,
    "builtin-shaders.json is stale - run: node tools/shader-check/bake-builtins.mjs",
  );
});

test("every built-in has the stable identity the publish command upserts on", () => {
  const entries = JSON.parse(readFileSync(OUT, "utf8"));
  const keys = new Set();
  for (const e of entries) {
    assert.match(e.builtin_key ?? "", /^[a-z0-9-]+$/, `bad builtin_key: ${JSON.stringify(e.builtin_key)}`);
    assert.ok(!keys.has(e.builtin_key), `duplicate builtin_key ${e.builtin_key} - the unique index would reject this`);
    keys.add(e.builtin_key);
    assert.ok(typeof e.source === "string" && e.source.length > 0, `${e.builtin_key} has no source`);
    assert.ok(Array.isArray(e.inputs), `${e.builtin_key} has no parsed inputs`);
  }
});

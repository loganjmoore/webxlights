#!/usr/bin/env node
// Bakes the authored shader library into a JSON file the API image can actually read.
//
//   node tools/shader-check/bake-builtins.mjs [--check]
//
// Two facts about this deployment decide the whole design, and both were checked against the
// repo rather than assumed:
//
//   1. `packages/` is NOT in the runtime image. The Dockerfile's final stage copies only
//      `--from=vendor /app` (apps/api) and `--from=web-build /repo/apps/web/dist`. The
//      `COPY packages/ packages/` on line 12 is in the web BUILD stage and never reaches the
//      running container. So nothing at runtime can read packages/shaders/library/*.fs.
//   2. The container runs `php artisan migrate --force` on every boot and never runs a seeder
//      (apps/api/docker/entrypoint.sh). A DatabaseSeeder entry would work perfectly on a laptop
//      and silently do nothing in production - the worst possible failure, because it looks
//      fine everywhere you would test it.
//
// So the .fs files stay under packages/shaders/library/ where they belong with the tooling and
// the tests, and this script bakes them into apps/api/database/data/builtin-shaders.json, which
// IS inside the image. `--check` regenerates and diffs instead of writing, which is what the
// test uses: the committed JSON can never drift from the shaders it was built from.

import "./tsResolve.mjs";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const LIBRARY_DIR = join(repo, "packages", "shaders", "library");
const OUT = join(repo, "apps", "api", "database", "data", "builtin-shaders.json");

const { parseIsf } = await import("../../packages/formats/src/isf.ts");

/**
 * The family, as a category a person would browse by.
 *
 * Folded into `categories` rather than given a column of its own: the gallery already filters and
 * searches on categories, so this makes 50 built-ins browsable by what they ARE ("Seasonal",
 * "Motion background") with no schema change at all. The ISF header's own CATEGORIES are almost
 * always just "Generator", which is true and useless for browsing.
 */
const FAMILY_LABELS = {
  "light-show-canon": "Light show",
  "motion-background": "Motion background",
  natural: "Natural",
  geometric: "Geometric",
  seasonal: "Seasonal",
};

/** "candy-cane" -> "Candy Cane". The id is the stable key; this is only what a person reads. */
function titleCase(id) {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** The description a user would have typed, so a built-in is searchable the same way. */
function prompts() {
  try {
    const lib = JSON.parse(readFileSync(join(here, "library.json"), "utf8"));
    return Object.fromEntries(lib.descriptions.map((d) => [d.id, d]));
  } catch {
    return {};
  }
}

export function bake() {
  const meta = prompts();
  const files = existsSync(LIBRARY_DIR)
    ? readdirSync(LIBRARY_DIR).filter((f) => f.endsWith(".fs")).sort()
    : [];

  return files.map((file) => {
    const id = basename(file, ".fs");
    const source = readFileSync(join(LIBRARY_DIR, file), "utf8");
    const parsed = parseIsf(source); // throws on a malformed header, which is the right failure
    const entry = meta[id] ?? {};
    return {
      // The stable identity a re-deploy upserts on. Never derived from the name, which a person
      // may want to change, and never the row id, which differs per install.
      builtin_key: id,
      name: titleCase(id),
      description: parsed.description ?? entry.text ?? null,
      // The whole ISF file, header included - exactly what the app stores when a user publishes
      // a generated shader, so a built-in and a user shader are the same kind of row.
      source,
      inputs: parsed.inputs,
      categories: [...new Set([...(parsed.categories ?? []), FAMILY_LABELS[entry.family] ?? null].filter(Boolean))],
      prompt: entry.text ?? null,
      family: entry.family ?? null,
    };
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const baked = bake();
  const text = JSON.stringify(baked, null, 2) + "\n";

  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (current !== text) {
      console.error(
        `${OUT} is out of date.\n` +
        `  committed: ${current.length} bytes, ${(() => { try { return JSON.parse(current || "[]").length; } catch { return "?"; } })()} shaders\n` +
        `  rebuilt:   ${text.length} bytes, ${baked.length} shaders\n` +
        "Run: node tools/shader-check/bake-builtins.mjs",
      );
      process.exit(1);
    }
    console.log(`builtin-shaders.json is in sync (${baked.length} shaders)`);
    process.exit(0);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${baked.length} built-in shaders to ${OUT.replace(repo + "/", "")}`);
}

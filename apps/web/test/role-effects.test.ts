import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EFFECT_SCHEMAS } from "@webxlights/engine";
import { ROLE_EFFECTS, TWO_D_ONLY } from "../src/lib/magic/roleEffects";
import { priors } from "../src/lib/magic/priors";

// The API validates the AI director's plan against the same table, from a baked copy (the API
// image has no TypeScript). Regenerate it with: MAGIC_BAKE=1 npx vitest run test/role-effects.test.ts
const BAKED = fileURLToPath(new URL("../../api/database/data/magic-role-effects.json", import.meta.url));
const table = { generatedFrom: `tools/sequence-corpus/priors.json (${priors.generatedAt})`, roles: ROLE_EFFECTS };

describe("effects allowed per role", () => {
  it("only names effects the engine renders, and keeps 2D-only effects off line props by role", () => {
    for (const [role, names] of Object.entries(ROLE_EFFECTS)) {
      for (const name of names) expect(EFFECT_SCHEMAS[name], `${role}: ${name}`).toBeDefined();
      if (role !== "matrix") expect(names.filter((n) => TWO_D_ONLY.has(n)), role).toEqual([]);
    }
    expect(ROLE_EFFECTS.arch).toContain("SingleStrand");
    expect(ROLE_EFFECTS.matrix).toContain("Text");
    expect(ROLE_EFFECTS.bush).toContain("Twinkle");
    expect(ROLE_EFFECTS.flood).toContain("Off");
    expect(ROLE_EFFECTS.arch).not.toContain("Off");
  });

  it("is baked, unchanged, for the API", () => {
    if (process.env.MAGIC_BAKE) writeFileSync(BAKED, `${JSON.stringify(table, null, 2)}\n`);
    expect(existsSync(BAKED), "missing - run MAGIC_BAKE=1 npx vitest run test/role-effects.test.ts in apps/web").toBe(true);
    expect(JSON.parse(readFileSync(BAKED, "utf-8")), "stale - run MAGIC_BAKE=1 npx vitest run test/role-effects.test.ts in apps/web").toEqual(table);
  });
});

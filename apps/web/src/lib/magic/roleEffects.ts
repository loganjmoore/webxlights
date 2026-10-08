import { CANVAS_ONLY_EFFECTS, EFFECT_SCHEMAS, TIMING_TRACK_EFFECTS } from "@webxlights/engine";
import { ROLE_NAMES, type Role } from "../propRoles";
import { engineEffectName } from "../xsqEffectSettings";
import { priors } from "./priors";

// Which effects Magic Sequence may put on each role: what the corpus spends real time on (at
// least 1.5% of a role's seconds) plus what it singles out for that role (lift of 1.5 or more),
// minus what the generator can't supply. The same table validates the AI director's plan on the
// server (apps/api/database/data/magic-role-effects.json, kept in step by a test).

/** Effects that need a file, a drawing or a timing track the generator can't make. */
const NEEDS_INPUT = new Set(["Pictures", "Shader", "Sketch", ...TIMING_TRACK_EFFECTS, ...CANVAS_ONLY_EFFECTS]);
/** Effects that only read on a 2D buffer; never placed on a line of lights. */
export const TWO_D_ONLY = new Set(["Pictures", "Text"]);

function allowedFor(role: Role): string[] {
  // A moving head is a DMX fixture: pixel effects mean nothing to it.
  if (role === "moving_head") return [];
  const names = new Set<string>();
  for (const [name, share] of Object.entries(priors.roles[role]?.effectShareBySeconds ?? {})) if (share >= 0.015) names.add(name);
  for (const [name, lift] of Object.entries(priors.roleLift[role] ?? {})) if (lift >= 1.5) names.add(name);
  return [...names]
    .map((name) => (name === "Music Effect" ? "Music" : engineEffectName(name)))
    .filter((name) => Object.hasOwn(EFFECT_SCHEMAS, name) && !NEEDS_INPUT.has(name))
    // Off is a backdrop on floods and nothing anywhere else; Text belongs on the matrix.
    .filter((name) => (name !== "Off" || role === "flood") && (name !== "Text" || role === "matrix"));
}

export const ROLE_EFFECTS = Object.fromEntries(ROLE_NAMES.map((role) => [role, allowedFor(role)])) as Record<Role, string[]>;

import { EFFECT_SCHEMAS, type SectionLabel, type SongMap } from "@webxlights/engine";
import type { Role } from "../propRoles";
import type { ShowPlan } from "./plan";
import { ROLE_EFFECTS } from "./roleEffects";

// Chat edits that need no model (docs/MAGIC-SEQUENCE.md 6.3): the two asks forum users make most,
// "less strobe" and "make the second chorus bigger", applied to the plan, so Change re-arranges
// the same show with that one thing different. Anything else goes to the AI director.

/** Effect names that are also ordinary words about a house; "less on the tree" names no effect. */
const NOT_NAMES = new Set(["On", "Off", "Tree", "Music", "Life", "Fill", "Lines", "Shape", "State", "Faces", "Video"]);
const LABELS: Record<string, SectionLabel> = { intro: "intro", verse: "verse", prechorus: "prechorus", "pre-chorus": "prechorus", chorus: "chorus", bridge: "bridge", breakdown: "breakdown", solo: "solo", outro: "outro", ending: "outro" };
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1, final: -1 };

/** The effects a phrase names: "strobes", "colour wash", "twinkle". */
export function effectsIn(phrase: string): string[] {
  const text = ` ${phrase.toLowerCase().replace(/colour/g, "color")} `;
  return Object.keys(EFFECT_SCHEMAS).filter((name) => {
    if (NOT_NAMES.has(name)) return false;
    const word = name.toLowerCase().replace(/[^a-z0-9]+/g, "[ -]?");
    return new RegExp(`[^a-z]${word}(e?s)?[^a-z]`).test(text);
  });
}

/** The sections a phrase points at: "the second chorus", "verse 2", "the choruses", "the ending". */
export function sectionsIn(phrase: string, song: SongMap): number[] {
  const out = new Set<number>();
  const re = /(?:\b(first|second|third|fourth|fifth|last|final|\d+)(?:st|nd|rd|th)?\s+)?\b(pre-?chorus|chorus|verse|intro|bridge|breakdown|solo|outro|ending)(?:es|s)?\b(?:\s+(\d+))?/g;
  for (const m of phrase.toLowerCase().matchAll(re)) {
    const label = LABELS[m[2]!]!;
    const indices = song.sections.map((s, i) => (s.label === label ? i : -1)).filter((i) => i >= 0);
    const which = m[1] ?? m[3];
    if (which === undefined) indices.forEach((i) => out.add(i));
    else {
      const n = ORDINALS[which] ?? Number(which);
      const i = n < 0 ? indices[indices.length - 1] : indices[n - 1];
      if (i !== undefined) out.add(i);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The plan with one plain-language change, or null when the ask is not one of the two it knows.
 * "less strobe", "no twinkle", "without lightning": those effects leave every role and layer.
 * "make the second chorus bigger", "the verses calmer": those sections' intensity moves a quarter.
 */
export function ruleEdit(plan: ShowPlan, song: SongMap, ask: string): ShowPlan | null {
  const text = ask.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const drop = /\b(?:less|no|fewer|without|remove|lose|drop|stop)\b(.*)/.exec(text);
  const names = drop ? effectsIn(drop[1]!) : [];
  if (names.length) {
    const avoid = [...new Set([...(plan.avoid ?? []), ...names])];
    return {
      ...plan,
      avoid,
      sections: plan.sections.map((s) => ({
        ...s,
        families: Object.fromEntries(Object.entries(s.families).map(([role, list]) => {
          const kept = (list ?? []).filter((n) => !avoid.includes(n));
          return [role, kept.length ? kept : ROLE_EFFECTS[role as Role].filter((n) => !avoid.includes(n)).slice(0, 3)];
        })),
      })),
    };
  }
  const bigger = /\b(bigger|brighter|busier|louder|stronger|more intense|more energy|more going on)\b/.test(text);
  const smaller = /\b(smaller|calmer|quieter|dimmer|softer|gentler|less busy|less intense|less going on)\b/.test(text);
  const targets = bigger !== smaller ? sectionsIn(text, song) : [];
  if (!targets.length) return null;
  const step = bigger ? 0.25 : -0.25;
  return { ...plan, sections: plan.sections.map((s) => (targets.includes(s.index) ? { ...s, intensity: Math.max(0.05, Math.min(1, s.intensity + step)) } : s)) };
}

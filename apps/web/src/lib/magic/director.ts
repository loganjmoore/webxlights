import { hashRandom01 } from "@webxlights/engine";
import type { PropInfo, Role } from "../propRoles";
import { FAVOUR, feelSpec, type FeelSpec } from "./feels";
import type { Accents, Feel, MagicPlanResponse, Motion, SectionPlan, ShowPlan, Style } from "./plan";
import { priors } from "./priors";
import picker from "./picker.json";
import { ROLE_EFFECTS } from "./roleEffects";
import type { SongMap } from "@webxlights/engine";

// The rules director: song + props + feel -> a ShowPlan (docs/MAGIC-SEQUENCE.md 2.3). Always
// available, deterministic for a seed, and what fills any gap the AI director leaves.

const HERO_ROLES = new Set<Role>(["mega_tree", "matrix", "singing_face"]);
const MOTIONS: Motion[] = ["left-to-right", "right-to-left", "centre-out", "alternate", "unison"];
const SWEEPS: Motion[] = ["left-to-right", "right-to-left", "centre-out"];
/** The show style's loud and quiet: one colour a bar above, outlines only below. */
export const SHOW_LOUD = 0.7;
export const SHOW_QUIET = 0.4;

/**
 * Which sections a show plays loud: at least SHOW_LOUD, and of a kind (repeat group) that has a
 * section in this song's louder half. Ranked by intensity, with ties (a feel can lift several
 * sections to the top) broken by the song's own energy and choruses first, so a song that is
 * loud all through still has verses that hold back, and a chorus plays alike every time.
 */
export function showLoud(song: SongMap, intensities: readonly number[]): boolean[] {
  const score = (i: number) => (intensities[i] ?? 0) + 0.01 * song.sections[i]!.energy + (song.sections[i]!.label === "chorus" ? 0.005 : 0);
  const ranked = song.sections.map((_, i) => i).sort((a, b) => score(b) - score(a));
  const loudGroups = new Set(ranked.slice(0, Math.ceil(ranked.length / 2)).map((i) => song.sections[i]!.group));
  return song.sections.map((s, i) => (intensities[i] ?? 0) >= SHOW_LOUD && loudGroups.has(s.group));
}
/** The corpus keys a few effects by xLights' own name. */
export const nativeEffectName = (name: string) => (name === "Snow Storm" ? "Snowstorm" : name === "Tendrils" ? "Tendril" : name === "Music" ? "Music Effect" : name);

/** A stable 0..1 for a seed and a key: the same question always gets the same answer. */
export function keyedRandom(seed: number, key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return hashRandom01(seed, h >>> 0);
}

/** Weighted sampling without replacement, deterministic for (seed, key). */
export function weightedOrder<T>(items: readonly T[], weight: (item: T) => number, seed: number, key: string): T[] {
  // Efraimidis-Spirakis: sort by u^(1/w), largest first.
  return items
    .map((item, i) => ({ item, w: weight(item), u: keyedRandom(seed, `${key}#${i}`) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => Math.log(b.u) / b.w - Math.log(a.u) / a.w)
    .map((x) => x.item);
}

export function effectWeight(role: Role, name: string, feel: FeelSpec, intensity: number): number {
  if (feel.avoids.includes(name) || name === "Off") return 0;
  const native = nativeEffectName(name);
  const share = priors.roles[role]?.effectShareBySeconds[native] ?? 0.01;
  const lift = priors.roleLift[role]?.[native] ?? 1;
  const loud = priors.intensity.highVsLowLift[native] ?? 1;
  const intensityLift = intensity >= 0.66 ? loud : intensity <= 0.33 ? 1 / loud : 1;
  // What people kept and added in the Magic Sequences they shared (train-picker.mjs): 1 until
  // enough of them have.
  const learned = (picker.multipliers as Record<string, Record<string, number> | undefined>)[role]?.[name] ?? 1;
  // Squared: a song only has a handful of looks, so sampling by plain share leaves too much to
  // chance and lands further from the corpus's mix than a typical real song does.
  return Math.pow(share * Math.pow(lift, feel.character) * (feel.favours.includes(name) ? FAVOUR : 1) * intensityLift * learned, 2);
}

function sectionIntensity(song: SongMap, index: number, feel: FeelSpec): number {
  const section = song.sections[index]!;
  const lastChorus = song.sections.map((s) => s.label).lastIndexOf("chorus") === index;
  const byLabel = { chorus: 0.08, prechorus: 0.03, intro: -0.1, outro: -0.05, breakdown: -0.15, verse: 0, bridge: 0, solo: 0.05 }[section.label] ?? 0;
  // The feel scales intensity rather than shifting it, so a loud feel still has quiet sections.
  return Math.max(0.05, Math.min(1, (0.15 + 0.75 * section.energy + byLabel + (lastChorus ? 0.1 : 0)) * (1 + feel.intensityShift)));
}

export interface DirectorInput {
  song: SongMap;
  props: readonly PropInfo[];
  feel: Feel;
  seed: number;
  /** A saved palette the user chose instead of the feel's. */
  palette?: string[];
  style?: Style;
}

export function rulesDirector({ song, props, feel: feelName, seed, palette, style = "classic" }: DirectorInput): ShowPlan {
  // The mood style is a show too: everything below that a show does, it does, unless it says not.
  const mood = style === "mood", show = style === "show" || mood;
  const feel = feelSpec(feelName, song);
  const roles = [...new Set(props.filter((p) => !p.key.startsWith("submodel:")).map((p) => p.role))].filter((r) => ROLE_EFFECTS[r].length > 0);
  const palettes: Record<string, string[]> = {};
  // A mood keeps one colour family all song.
  const paletteList = palette?.length ? [palette, ...feel.palettes] : mood ? [feel.mood] : feel.palettes;
  paletteList.forEach((colors, i) => (palettes[`p${i}`] = colors));

  // Looks are per repeat group: the chorus looks like the chorus every time it comes round.
  const looks = [...new Set(song.sections.map((s) => s.group))];
  const chorusGroup = song.sections.find((s) => s.label === "chorus")?.group;
  const lookOrder = chorusGroup ? [chorusGroup, ...looks.filter((g) => g !== chorusGroup)] : looks;

  const loudness = showLoud(song, song.sections.map((_, i) => sectionIntensity(song, i, feel)));
  const sections: SectionPlan[] = song.sections.map((section, index) => {
    const intensity = sectionIntensity(song, index, feel);
    const look = section.group;
    const lookIndex = lookOrder.indexOf(look);
    const families: SectionPlan["families"] = {};
    for (const role of roles) {
      // Families are a property of the look, so the same section type gets the same effects;
      // intensity only nudges the weights through the corpus's loud-vs-quiet lift.
      const lookIntensity = Math.max(...song.sections.map((s, i) => (s.group === look ? sectionIntensity(song, i, feel) : 0)));
      const ranked = weightedOrder(ROLE_EFFECTS[role], (name) => effectWeight(role, name, feel, lookIntensity), seed, `fam:${look}:${role}`);
      // A singing face sings: Faces needs a lyric track the generator can't make, and an
      // audio-level VU Meter is the nearest thing to it.
      if (role === "singing_face" && ranked.includes("VU Meter")) ranked.unshift(...ranked.splice(ranked.indexOf("VU Meter"), 1));
      families[role] = ranked.slice(0, 3);
    }
    const heroes = roles.filter((r) => HERO_ROLES.has(r));
    const others = weightedOrder(roles.filter((r) => !HERO_ROLES.has(r) && r !== "whole_house"), (r) => priors.roles[r]?.coverage.p50 ?? 0.1, seed, `feat:${look}`);
    const featured = [...heroes, ...others.slice(0, intensity >= 0.66 ? 2 : intensity >= 0.35 ? 1 : 0)];
    const motionRoll = keyedRandom(seed, `motion:${look}`);
    // A show's loud parts move as one, changing colour together on the bar; elsewhere a sweep
    // crosses the whole front of the house.
    // A mood's middle sections pass the house between its halves half the time ("alternate").
    const motion: Motion = show
      ? loudness[index] ? "unison" : mood && motionRoll < 0.5 ? "alternate" : SWEEPS[Math.floor((mood ? motionRoll * 2 - 1 : motionRoll) * SWEEPS.length)]!
      : intensity < 0.3 ? "unison" : MOTIONS[Math.floor(motionRoll * MOTIONS.length)]!;
    const accents: Accents = intensity >= 0.7 ? (song.bpm < 110 || show ? "beats" : "downbeats") : intensity >= 0.45 ? "downbeats" : "none";
    return {
      index, look, intensity, palette: mood ? "p0" : `p${lookIndex % paletteList.length}`, featured, families, motion,
      accents: accents !== "none" && ["rock", "powerful"].includes(feelName) && song.hits.length > 0 ? "hits" : accents,
      wholeHouseHit: false,
    };
  });

  // Whole-house hits where they earn it: the first chorus and the last one.
  const choruses = sections.filter((s) => song.sections[s.index]!.label === "chorus");
  for (const s of [choruses[0], choruses[choruses.length - 1]]) if (s && s.index > 0) s.wholeHouseHit = true;

  // Neighbours must differ: a repeated group straight after itself gets the next palette and
  // its families rotated, so the second verse reads as a continuation rather than a stall.
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1]!, cur = sections[i]!;
    // A mood has the one palette, so only a repeated look counts.
    if (cur.look !== prev.look && (mood || cur.palette !== prev.palette)) continue;
    if (cur.look === prev.look) cur.look = `${cur.look}${i}`;
    if (!mood) cur.palette = `p${(Number(prev.palette.slice(1)) + 1) % paletteList.length}`;
    for (const role of roles) {
      const list = cur.families[role];
      if (list && list.length > 1) cur.families[role] = [...list.slice(1), list[0]!];
    }
  }

  const last = song.sections[song.sections.length - 1];
  // A mood closes on a white twinkle that fades, whatever the song does.
  return { seed, palettes, sections, ending: !mood && last && last.energy >= 0.6 ? "hit-then-dark" : "fade", style };
}

/**
 * The AI director's plan with every gap filled from the rules director's (or, for a chat edit,
 * from the plan being edited).
 *
 * The server has already dropped whatever failed validation; this re-checks against what the
 * client knows (the roles actually in this layout) and takes each field independently, so one
 * bad section costs that section's field, not the plan.
 */
export function completePlan(ai: MagicPlanResponse["plan"], rules: ShowPlan, roles: readonly Role[]): ShowPlan {
  const present = new Set(roles);
  const palettes = { ...rules.palettes };
  for (const [name, colors] of Object.entries(ai.palettes ?? {})) {
    const valid = colors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).map((c) => c.toLowerCase());
    if (valid.length >= 2) palettes[name] = valid.slice(0, 6);
  }
  const sections = rules.sections.map((base) => {
    const s = ai.sections?.find((x) => x.index === base.index);
    if (!s) return base;
    const families: SectionPlan["families"] = { ...base.families };
    for (const [role, names] of Object.entries(s.families ?? {}) as [Role, string[]][]) {
      const allowed = (names ?? []).filter((n) => present.has(role) && ROLE_EFFECTS[role]?.includes(n));
      if (allowed.length) families[role] = allowed;
    }
    return {
      index: base.index,
      look: typeof s.look === "string" && s.look ? s.look : base.look,
      intensity: typeof s.intensity === "number" && Number.isFinite(s.intensity) ? Math.max(0, Math.min(1, s.intensity)) : base.intensity,
      palette: s.palette && palettes[s.palette] ? s.palette : base.palette,
      featured: s.featured?.filter((r) => present.has(r)).length ? s.featured.filter((r) => present.has(r)) : base.featured,
      families,
      motion: s.motion && MOTIONS.includes(s.motion) ? s.motion : base.motion,
      accents: s.accents && ["none", "downbeats", "beats", "hits"].includes(s.accents) ? s.accents : base.accents,
      wholeHouseHit: typeof s.wholeHouseHit === "boolean" ? s.wholeHouseHit : base.wholeHouseHit,
    };
  });
  const ending = ai.ending && ["fade", "hit-then-dark", "hold"].includes(ai.ending) ? ai.ending : rules.ending;
  return { seed: rules.seed, palettes, sections, ending, ...(rules.style ? { style: rules.style } : {}), ...(rules.avoid ? { avoid: rules.avoid } : {}) };
}

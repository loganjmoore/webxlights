import { EFFECT_SCHEMAS, NOTE_RANGE_VU_METER_TYPES, defaultParamsFor, type PictureImage } from "@webxlights/engine";
import { colorInputNames, defaultValueFor } from "@webxlights/formats";
import type { EffectParamValue, RowElementType, SequenceEffect, ShaderRecord } from "../api";
import type { PropInfo, Role, Tier } from "../propRoles";
import { PARAMS, importEffectSettings } from "../xsqEffectSettings";
import { keyedRandom, nativeEffectName, SHOW_QUIET, showLoud, weightedOrder } from "./director";
import type { FeelSpec } from "./feels";
import { drawMotif, songMotifs } from "./motifs";
import { spriteById, spriteFor, type Sprite } from "./sprites";
import type { SectionPlan, ShowPlan } from "./plan";
import { priors } from "./priors";
import { RANDOM_FLASH, ROLE_EFFECTS, TWO_D_ONLY } from "./roleEffects";
import type { SongMap } from "@webxlights/engine";

// The choreographer: (SongMap, PropMap, ShowPlan, priors) -> effects (docs/MAGIC-SEQUENCE.md
// 2.4). Pure and seeded, so a generated sequence can be reproduced, tested and regenerated.

export interface Placement {
  elementType: Extract<RowElementType, "model" | "group" | "submodel">;
  /** The model or group; a sub-model's parent model. */
  elementId: number;
  /** A sub-model's name. */
  subName?: string;
  /** The prop this lands on, "model:12", "group:3" or "submodel:12/Star". */
  key: string;
  role: Role;
  effect: Omit<SequenceEffect, "id">;
}

export interface ChoreographOptions {
  feel: FeelSpec;
  /** Overrides plan.seed: "Try another" re-rolls the choices, not the plan. */
  seed?: number;
  frameMs: number;
  /** For Text on a matrix, and which pictures it gets. */
  title?: string;
  /** Library shaders it may place on the 2D heroes and the whole house: the built-ins, and the user's starred ones. */
  shaders?: readonly MagicShader[];
  /** The ids among them the user starred: played first, and even without colour inputs (they bring their own colours). */
  favourites?: ReadonlySet<number>;
  /**
   * When the song has lyric timing: its phoneme track, and the models that have a face
   * definition ("model:12" -> definition name). Their singing faces, and singing-face sub-models
   * on them, sing the words all song; any other prop with one (a singing tree) sings each line.
   */
  singing?: { track: string; faces: ReadonlyMap<string, string> };
  /** The sung lines, timed (the lyric phrase track): a line that names a sprite shows it. */
  lyrics?: readonly { label: string; startMs: number; endMs: number }[];
  /** Pictures an image model drew for plan.pictures' subjects: subject -> pictureData string. */
  drawn?: ReadonlyMap<string, string>;
}

export type MagicShader = Pick<ShaderRecord, "id" | "name" | "source" | "inputs">;

/** Effects that mark a beat: re-triggered at the beat grid, each filling to the next. */
export const PUNCTUAL = new Set(["On", "Shockwave", "Ripple", "Curtain", "SingleStrand", "Color Wash", "Strobe", "Fan", "Bars", "Morph", "Marquee", "Lightning", "Shape", "Circles", "Fill"]);
const TIER_PRIORITY: Record<Tier, number> = { fill: 0, frame: 1, feature: 2, hero: 3 };
/** The order a show brings its roles in as the music builds: the frame of the house, then the fills, then the features. */
const ENTRY_ORDER: Record<Tier, number> = { frame: 0, fill: 1, feature: 2, hero: 3 };
/**
 * How much of the house a section lights. The corpus lights 30-36% of a song's props at any
 * second (quietest 16 s ~24%, busiest ~52%); Logan asked (2026-10-10) for most of the display lit
 * most of the time but not all of it all of the time. So the quietest section lights 60% of the
 * rows and the busiest 90%, and the music's rise and fall shows as brightness (glow, below)
 * rather than as props going dark. Rests, breakdowns and the beat before a drop still go dark.
 */
const LIT_SHARE_MIN = 0.6;
const LIT_SHARE_MAX = 0.9;
/** A shader bed's brightness against the props' own colours in the same section. */
const BED_GLOW = 0.5;
/** Pictures carry their pixels in the sequence body, about 10 KB each, inside the autosave budget. */
const MAX_PICTURES = 8;
/** Library pictures are named, not stored, so the lyrics can call up many more of them. */
const MAX_LYRIC_PICTURES = 32;

interface Unit { prop: PropInfo; elementType: Placement["elementType"]; elementId: number; subName?: string; order: number }
interface Draft { unit: Unit; layer: number; startMs: number; endMs: number; name: string; params: SequenceEffect["params"]; palette: string[]; layerSettings?: SequenceEffect["layer"]; mix?: number; fadeInMs?: number; fadeOutMs?: number; hit?: boolean }

const presetCache = new Map<string, SequenceEffect["params"]>();
/** The corpus's typical settings for an effect, as engine params. */
function presetParams(name: string): SequenceEffect["params"] {
  let params = presetCache.get(name);
  if (!params) {
    const native = nativeEffectName(name);
    const settings: Record<string, string> = {};
    for (const [key, stat] of Object.entries(priors.parameterPresets[native] ?? {})) {
      settings[key] = stat.type === "choice" ? Object.entries(stat.shares).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "" : String(stat.p50);
    }
    params = importEffectSettings(native, settings).params;
    presetCache.set(name, params);
  }
  return { ...params };
}

/** A texture's corpus length in beats, quantised to 4, 8 or 16: textures run for phrases. */
function textureBeats(name: string): number {
  const p50 = priors.durationBeatsByEffect[nativeEffectName(name)]?.p50 ?? 4;
  return [4, 8, 16].reduce((best, q) => (Math.abs(Math.log2(q / p50)) < Math.abs(Math.log2(best / p50)) ? q : best), 4);
}

/**
 * How often a punctual effect re-triggers, in beats. The corpus's effects are mostly a beat long,
 * but a prop is lit a fifth of the time and the song's effect rate is about 180 a minute: so a
 * beat apart only where it is loud and the prop is carrying the section, a bar or more where it is
 * quiet, and held across beats at fast tempos (1.8 beats median above 130 BPM).
 */
function punctualInterval(intensity: number, tier: Tier, featured: boolean, bpm: number): number {
  // A role that comes in to carry a section drives the beat; heroes, lit nearly all song, pulse
  // a bar at a time under it.
  const beats = featured && tier !== "hero"
    ? (intensity >= 0.95 ? 1 : intensity >= 0.6 ? 2 : intensity >= 0.35 ? 4 : 8)
    : tier === "hero" ? (intensity >= 0.75 ? 4 : 8)
    : (intensity >= 0.4 ? 4 : 8);
  return bpm >= 130 ? Math.min(8, beats * 2) : beats;
}

const clampTo = (name: string, key: string, value: number) => {
  const spec = EFFECT_SCHEMAS[name]?.params.find((p) => p.key === key);
  const clamped = Math.max(spec?.min ?? -Infinity, Math.min(spec?.max ?? Infinity, value));
  return spec?.type === "intSlider" ? Math.round(clamped) : Math.round(clamped * 100) / 100;
};

/** Params for one placement: corpus preset, cycles tied to tempo, speed to the feel, direction varied. */
function effectParams(name: string, beats: number, variation: number, feel: FeelSpec, title: string | undefined): { params: SequenceEffect["params"]; layer?: SequenceEffect["layer"] } {
  const params = { ...defaultParamsFor(name), ...presetParams(name) };
  // Cycles follow the music: the corpus's cycles per beat times this effect's length.
  for (const [key, stat] of Object.entries(priors.cyclesPerBeat[nativeEffectName(name)] ?? {})) {
    if (!/(Cycles|Chase_Rotations|Spirals_Movement)$/.test(key)) continue;
    const entry = Object.entries(PARAMS[name] ?? {}).find(([, m]) => m.key === key);
    if (entry) params[entry[0]] = clampTo(name, entry[0], (stat.p50 * beats) / (entry[1].scale ?? 1));
  }
  if (typeof params.speed === "number") params.speed = clampTo(name, "speed", params.speed * feel.speed);
  const options = EFFECT_SCHEMAS[name]?.params.find((p) => p.key === "colors")?.options;
  if (options?.includes("palette")) params.colors = "palette";
  if (name === "VU Meter") {
    // The timing-event and note types need a track or a note range the generator doesn't make.
    const shares = priors.parameterPresets["VU Meter"]?.E_CHOICE_VUMeter_Type;
    const usable = (EFFECT_SCHEMAS["VU Meter"]!.params.find((p) => p.key === "type")!.options ?? []).filter((t) => !/^Timing|^Note/.test(t) && !NOTE_RANGE_VU_METER_TYPES.has(t));
    const ranked = shares?.type === "choice" ? Object.keys(shares.shares).filter((t) => usable.includes(t)) : [];
    params.type = ranked[0] ?? (usable.includes("Level Pulse") ? "Level Pulse" : usable[0]!);
  }
  if (name === "Text") {
    params.text = (title || "Merry Christmas").toUpperCase().slice(0, 24);
    params.movement = "left";
  }
  if (name === "On" && beats > 2) params.endIntensity = 30;
  // Full rather than sparse (Logan, 2026-10-10: most of the display lit most of the time): a chase
  // covers at least 40% of its prop, where the corpus's median chase is a tenth, and a twinkle
  // lights a quarter of the lights rather than 3%.
  if (name === "SingleStrand") params.chaseSizePct = Math.max(Number(params.chaseSizePct) || 0, 40);
  if (name === "Twinkle") params.countPct = Math.max(Number(params.countPct) || 0, 25);
  // Re-trigger the same family, vary the direction (the corpus repeats an effect 73-94% of the
  // time and almost never as an identical copy).
  const flip = variation % 2 === 1;
  let layer: SequenceEffect["layer"] | undefined;
  if (flip) {
    const swap: Record<string, string> = { up: "down", down: "up", left: "right", right: "left", expand: "compress", compress: "expand", "h-expand": "h-compress", "h-compress": "h-expand", explode: "implode", implode: "explode", open: "close", close: "open" };
    for (const key of ["direction", "movement"]) {
      const value = params[key];
      if (typeof value === "string" && swap[value] && EFFECT_SCHEMAS[name]?.params.find((p) => p.key === key)?.options?.includes(swap[value]!)) params[key] = swap[value]!;
      else if (typeof value === "number" && key === "movement") params[key] = -value;
    }
    for (const key of ["counterClockwise", "reverse", "leftToRight"]) if (typeof params[key] === "boolean") params[key] = !params[key];
    if (name === "SingleStrand" || name === "Marquee" || name === "Wave") layer = { transform: "Flip Horizontal" };
  }
  return { params, ...(layer ? { layer } : {}) };
}

/**
 * A look's colour plan. The heroes and the fills lead in the palette's first colour, the frame of
 * the house holds the second, the features alternate between the two by role so neighbours
 * contrast, and the star takes the accent, the palette's last colour. The accent comes in with
 * the music: a quiet look stays in its rich colours, a loud one pairs nearly everything with it.
 * Every prop of a role wears the same pair for the whole look: colour changes with the look, not
 * with every trigger.
 */
function colourPlan(palette: readonly string[], roles: readonly Role[], tierOf: (r: Role) => Tier, intensity: number): { pairs: Map<Role, [string, string]>; accent: string } {
  const base = palette[0] ?? "#ffffff", second = palette[1] ?? base, accent = palette[palette.length - 1] ?? base;
  const lift = intensity >= 0.75 ? accent : undefined, rich = intensity < 0.4;
  const pairs = new Map<Role, [string, string]>();
  let feature = 0;
  for (const role of [...roles].sort()) {
    const tier = tierOf(role);
    pairs.set(role,
      role === "star" ? [accent, base]
      : tier === "hero" ? [base, rich ? second : accent]
      : tier === "frame" ? [second, lift ?? base]
      : tier === "feature" ? (feature++ % 2 ? [base, lift ?? second] : [second, rich ? base : accent])
      : [base, second]);
  }
  return { pairs, accent };
}

/**
 * Sub-model roles that mean a separate prop rather than a part: the star on a mega tree, a face on
 * a singing tree. Part names read as roles too often to trust the rest: a snowflake's "Circle 1"
 * is not a wreath, and a spinner's "Burst 2" is not another spinner (a real layout's 430
 * sub-models turned 650 effects into 4,000 before this list).
 */
const SUBMODEL_PROPS = new Set<Role>(["star", "singing_face"]);

/**
 * Who carries each role: the user's role group if it covers the role, else each model. A
 * sub-model that is a prop of its own carries its own role; a part is left to its parent. With
 * split (the mood style, which colours the halves of the house apart), a group with members on
 * both sides of the middle leaves the role to its members.
 */
function unitsByRole(props: readonly PropInfo[], split = false): Map<Role, Unit[]> {
  const byKey = new Map(props.map((p) => [p.key, p]));
  const parentOf = (p: PropInfo) => byKey.get(`model:${p.key.slice("submodel:".length).split("/")[0]}`);
  const models = props.filter((p) => p.nodes > 0 && (p.key.startsWith("model:") || (p.key.startsWith("submodel:") && SUBMODEL_PROPS.has(p.role) && parentOf(p) !== undefined && parentOf(p)!.role !== p.role)));
  const groups = props.filter((p) => p.key.startsWith("group:") && (p.members?.length ?? 0) >= 2);
  const out = new Map<Role, Unit[]>();
  const unit = (prop: PropInfo, order: number): Unit => {
    if (!prop.key.startsWith("submodel:")) return { prop, elementType: prop.key.startsWith("group:") ? "group" : "model", elementId: Number(prop.key.split(":")[1]), order };
    const [id, ...name] = prop.key.slice("submodel:".length).split("/");
    return { prop, elementType: "submodel", elementId: Number(id), subName: name.join("/"), order };
  };
  const roles = new Set(models.map((m) => m.role));
  for (const role of roles) {
    if (role === "whole_house" || ROLE_EFFECTS[role].length === 0) continue;
    const straddles = (g: PropInfo) => g.members!.some((k) => (byKey.get(k)?.x ?? 0.5) < 0.5) && g.members!.some((k) => (byKey.get(k)?.x ?? 0.5) >= 0.5);
    // Singing faces each sing their own face definition, which a group row has none of: two
    // faces in Magic's own "Singing faces" group used to sing nothing.
    const own = role === "singing_face" ? undefined : groups
      .filter((g) => g.role === role && g.members!.filter((k) => byKey.get(k)?.role === role).length >= 0.75 * g.members!.length && !(split && straddles(g)))
      .sort((a, b) => b.members!.length - a.members!.length || a.key.localeCompare(b.key))[0];
    const covered = new Set(own?.members ?? []);
    const carriers = [...(own ? [own] : []), ...models.filter((m) => m.role === role && !covered.has(m.key))].sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
    out.set(role, carriers.map(unit));
  }
  const house = groups.filter((g) => g.role === "whole_house").sort((a, b) => b.members!.length - a.members!.length)[0];
  if (house) out.set("whole_house", [unit(house, 0)]);
  return out;
}

/** A colour at a fraction of its brightness: the show style's quiet sections glow rather than shine. */
function dim(hex: string, f: number): string {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("")}`;
}
const isWhite = (hex: string) => [1, 3, 5].every((i) => parseInt(hex.slice(i, i + 2), 16) > 200);

/**
 * Every effect with [a, b) cut out of it: the house goes dark there. Not the whole-house hits, and
 * not a singing face, which would stop mid-word.
 */
function carve(drafts: readonly Draft[], a: number, b: number): Draft[] {
  const out: Draft[] = [];
  for (const d of drafts) {
    if (d.hit || d.name === "Faces" || d.endMs <= a || d.startMs >= b) {
      out.push(d);
      continue;
    }
    if (d.startMs < a) {
      const head: Draft = { ...d, endMs: a };
      delete head.fadeOutMs;
      out.push(head);
    }
    if (d.endMs > b) {
      const tail: Draft = { ...d, startMs: b, params: { ...d.params } };
      delete tail.fadeInMs;
      out.push(tail);
    }
  }
  return out;
}

/** The beat index at or after a time. */
function beatAtOrAfter(beats: readonly number[], ms: number): number {
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! < ms - 1) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function choreograph(song: SongMap, props: readonly PropInfo[], plan: ShowPlan, options: ChoreographOptions): Placement[] {
  const seed = options.seed ?? plan.seed;
  const { feel, frameMs } = options;
  const units = unitsByRole(props, plan.style === "mood");
  const allUnits = [...units.values()].flat();
  if (allUnits.length === 0 || song.beats.length < 2) return [];
  const beatMs = 60000 / song.bpm;
  // Fast enough to chase the beat: starts on beats. Slower than 90 BPM the corpus phrases by bar.
  const step = song.bpm >= 90 ? 1 : song.beatsPerBar;
  const beatTime = (b: number) => (b < song.beats.length ? song.beats[b]! : song.beats[song.beats.length - 1]! + (b - song.beats.length + 1) * beatMs);
  const drafts: Draft[] = [];
  const litBySection: Set<Unit>[] = [];
  const planOf = (si: number): SectionPlan => plan.sections.find((s) => s.index === si) ?? plan.sections[Math.min(si, plan.sections.length - 1)]!;
  // Looks in the order they first play: a repeat of a look gets the same shader and picture.
  const lookNumbers = new Map<string, number>();
  for (const s of plan.sections) if (!lookNumbers.has(s.look)) lookNumbers.set(s.look, lookNumbers.size);
  const favourites = options.favourites ?? new Set<number>();
  const usable = (options.shaders ?? []).filter((sh) => favourites.has(sh.id) || colorInputNames(sh.inputs ?? []).length > 0);
  const named = (names: readonly string[]) => names.map((n) => usable.find((sh) => sh.name === n)).filter((sh): sh is MagicShader => !!sh);
  // The user's starred shaders lead both lists: starring one is how to ask Magic for it.
  const starred = usable.filter((sh) => favourites.has(sh.id));
  const shaderLists = { calm: [...new Set([...starred, ...named(feel.shaders.calm)])], lively: [...new Set([...starred, ...named(feel.shaders.lively)])] };
  for (const key of ["calm", "lively"] as const) if (!shaderLists[key].length) shaderLists[key] = usable;
  // As EffectPropsPanel stores a picked shader: inputs and colour names ride as params.
  const shaderParams = (shader: MagicShader): SequenceEffect["params"] => {
    const inputs = shader.inputs ?? [];
    return {
      ...defaultParamsFor("Shader"), source: shader.source, speed: clampTo("Shader", "speed", (feel.speed * song.bpm) / 120), shaderId: shader.id,
      inputs: Object.fromEntries(inputs.map((i) => [i.name, defaultValueFor(i)])) as unknown as EffectParamValue,
      colorInputs: colorInputNames(inputs) as unknown as EffectParamValue,
    };
  };
  const motifs = songMotifs(options.title, feel.motifs);
  const images = new Map<string, PictureImage>();
  let picturesLeft = MAX_PICTURES;
  // The order roles come in for a look, kept so a repeat of the look lights the same roles.
  const lookRoles = new Map<string, Role[]>();
  const litLooks = new Map<Role, number>();
  const countedLooks = new Set<string>();
  const tierOf = (role: Role) => units.get(role)![0]!.prop.tier;
  const totalRows = allUnits.length;
  // A section's share of the house counts lights' props, not rows: a group of four arches is four.
  const propsOf = (u: Unit) => u.prop.members?.length ?? 1;
  const totalProps = allUnits.filter((u) => u.prop.role !== "whole_house").reduce((n, u) => n + propsOf(u), 0);
  const roleProps = (r: Role) => units.get(r)!.reduce((n, u) => n + propsOf(u), 0);

  // The show style plays the house as one instrument (plan.ts, Style). A mood is a show that
  // differs where it says so.
  const mood = plan.style === "mood";
  const show = plan.style === "show" || mood;
  const avoid = new Set(plan.avoid ?? []);
  // Its focal point wears the contrast colour: the star, else the feature nearest the centre.
  const focal = new Set<Unit>(units.get("star") ?? []);
  if (!focal.size) {
    const centre = allUnits.filter((u) => u.prop.tier === "feature").sort((a, b) => Math.abs(a.prop.x - 0.5) - Math.abs(b.prop.x - 0.5))[0];
    if (centre) focal.add(centre);
  }
  // Where each beat falls in its bar: the show's white accents go on the backbeats.
  const beatInBar: number[] = [];
  for (let i = 0, d = 0, pos = 0; i < song.beats.length; i++) {
    while (d < song.downbeats.length && song.downbeats[d]! < song.beats[i]! - 1) d++;
    pos = i === 0 || (d < song.downbeats.length && Math.abs(song.downbeats[d]! - song.beats[i]!) <= 1) ? 0 : pos + 1;
    beatInBar.push(pos);
  }
  const loudness = showLoud(song, song.sections.map((_, si) => planOf(si).intensity));
  // A breakdown, where the show answers the music on one role: one labelled so, or a section in
  // the song's quieter half that both its neighbours outshine.
  const dipAt = (si: number) => {
    if (!show || si === 0 || si === song.sections.length - 1) return false;
    const i = planOf(si).intensity;
    return song.sections[si]!.label === "breakdown" || (song.sections[si]!.rank >= song.sections.length / 2 && planOf(si - 1).intensity >= i + 0.2 && planOf(si + 1).intensity >= i + 0.2);
  };

  // The whole-house group plays the house as one canvas: a shader bed under the quiet and middle
  // sections, and the sweeps that carry each new colour across the front of the house. It renders
  // under every prop's own effects (applyGroupBase), so a prop shows it only while it is dark.
  const house = show ? units.get("whole_house")?.[0] : undefined;
  const houseMembers = new Set(house?.prop.members ?? []);
  const inHouse = (u: Unit) => (u.elementType === "submodel" ? houseMembers.has(`model:${u.elementId}`) : u.prop.members ? u.prop.members.every((k) => houseMembers.has(k)) : houseMembers.has(u.prop.key));
  const canSweep = house !== undefined && !avoid.has("Morph");
  const sweeps: { t: number; fromRight: boolean; head: string; tail: string[] }[] = [];

  song.sections.forEach((section, si) => {
    const sp = planOf(si);
    const palette = plan.palettes[sp.palette] ?? Object.values(plan.palettes)[0] ?? ["#ffffff", "#ff0000"];
    const { pairs, accent } = colourPlan(palette, [...units.keys()], tierOf, sp.intensity);
    const lookNo = lookNumbers.get(sp.look) ?? 0;
    const firstBeat = beatAtOrAfter(song.beats, section.startMs);
    const endBeat = si === song.sections.length - 1 ? song.beats.length : beatAtOrAfter(song.beats, section.endMs);
    if (endBeat <= firstBeat) return;
    const barStarts = song.downbeats.filter((d) => d >= section.startMs - 1 && d < section.endMs - 1);
    const roles = [...units.keys()];

    // The show style's colour: one across the house, moving on through the palette every bar
    // when loud, every two bars in between and every phrase when quiet. The focal prop wears the
    // colour before, so it always stands out; quiet sections glow at half brightness.
    const loud = show && loudness[si]!, quiet = show && sp.intensity < SHOW_QUIET;
    const hues = [...new Set(palette)];
    const period = loud ? 1 : quiet ? 4 : 2;
    const slot = (ms: number) => {
      let bar = 0;
      while (bar + 1 < barStarts.length && barStarts[bar + 1]! <= ms + 1) bar++;
      return Math.floor(bar / period) + lookNo;
    };
    // Quiet sections glow at half brightness and the middle ones at 80%: with most of the house lit
    // all song, brightness is what tells a verse from a chorus.
    const glow = sp.intensity < SHOW_QUIET ? 0.5 : sp.intensity < 0.6 ? 0.8 : 1;
    const shade = (c: string) => (glow < 1 ? dim(c, glow) : c);
    const houseColour = (ms: number) => shade(hues[slot(ms) % hues.length]!);
    const contrastColour = (ms: number) => shade(hues.length > 1 ? hues[(slot(ms) + hues.length - 1) % hues.length]! : "#ffffff");
    // Accents flash white, or the contrast where the house is already white.
    const flashColour = (ms: number) => (isWhite(houseColour(ms)) ? contrastColour(ms) : "#ffffff");
    // A mood wears two of its family at once, the house split down the middle, moving on through
    // pairs that all hold the home colour (the reference video is half its home blue). The focal
    // prop wears the other half's colour; a quiet section wears one colour everywhere.
    const moodPairs = hues.length >= 3 ? [[0, 1], [2, 0], [0, 2], [1, 0]] : [[0, 1], [1, 0]];
    const moodPair = (u: Unit, ms: number): [string, string] => {
      const pair = moodPairs[slot(ms) % moodPairs.length]!.map((i) => hues[i] ?? "#ffffff");
      const side = u.prop.x < 0.5 ? 0 : 1;
      const own = quiet ? 0 : focal.has(u) ? 1 - side : side;
      return [shade(pair[own]!), shade(pair[1 - own]!)];
    };
    // A mood's "alternate" passes the house between its halves: one half lit while the other
    // rests, swapping with the colour. The heroes carry on through both.
    const halves = mood && sp.motion === "alternate" && !quiet;

    if (dipAt(si)) {
      // A breakdown answers the music on one role: the house goes dark but for it and one
      // answering role, which flash on each hit, a new colour each time, the answer in the one
      // before. Below 90 BPM they flash on the bar.
      const byUnits = (a: Role, b: Role) => units.get(b)!.length - units.get(a)!.length || a.localeCompare(b);
      const others = roles.filter((r) => tierOf(r) !== "hero" && r !== "whole_house" && r !== "flood");
      const call = sp.featured.find((r) => others.includes(r) && tierOf(r) === "feature") ?? others.filter((r) => tierOf(r) === "feature").sort(byUnits)[0] ?? others.sort(byUnits)[0];
      const answer = (["pathway", "mini_tree", "bush", "present", "cane", "arch"] as Role[]).find((r) => r !== call && units.has(r));
      const triggers: number[] = [];
      if (step === 1) {
        for (const hit of song.hits) {
          if (hit.ms < section.startMs || hit.ms >= section.endMs || hit.strength < 0.5 || hit.band === "hat") continue;
          const t = beatTime(beatAtOrAfter(song.beats, hit.ms - beatMs / 4));
          if (Math.abs(t - hit.ms) <= beatMs / 4 && t - (triggers[triggers.length - 1] ?? -Infinity) >= beatMs - 1) triggers.push(t);
        }
      }
      if (triggers.length < 4) {
        triggers.length = 0;
        for (let b = firstBeat; b < endBeat; b += step === 1 ? 2 : step) triggers.push(beatTime(b));
      }
      const lit = new Set<Unit>();
      triggers.forEach((t, j) => {
        const endMs = Math.min(t + beatMs, triggers[j + 1] ?? section.endMs, section.endMs);
        const colour = hues[(j + lookNo) % hues.length]!, before = hues.length > 1 ? hues[(j + lookNo + hues.length - 1) % hues.length]! : "#ffffff";
        for (const [role, c] of [[call, colour], [answer, before]] as const) {
          for (const unit of role ? units.get(role)! : []) {
            drafts.push({ unit, layer: 0, startMs: t, endMs, name: "On", params: effectParams("On", 1, j, feel, options.title).params, palette: [c], fadeOutMs: (endMs - t) / 2 });
            lit.add(unit);
          }
        }
      });
      litBySection[si] = lit;
      return;
    }

    // A show's quiet and middle sections lie on a shader bed across the whole house, the house as
    // one picture: the heroes play the same shader, the roles carrying the beat pulse over it, and
    // everything else shows it. Its loud sections are the props' own, a colour a bar.
    const bed = house !== undefined && usable.length > 0 && !loud && !halves && !avoid.has("Shader");
    const shaderList = sp.intensity < 0.5 ? shaderLists.calm : shaderLists.lively;
    const sectionShader = shaderList[lookNo % Math.max(1, shaderList.length)];
    const third = (ms: number) => shade(hues[(slot(ms) + 1) % hues.length]!);
    const shaderPalette = (u: Unit, ms: number) => (mood ? [...moodPair(u, ms), shade(hues[2] ?? "#ffffff")] : [houseColour(ms), contrastColour(ms), third(ms)]);
    // A bed lights every light of every prop at once, where a loud section's props pulse and rest,
    // so it glows at half again: a verse on a bright bed outshone its chorus.
    const bedPalette = (u: Unit, ms: number) => shaderPalette(u, ms).map((c) => dim(c, BED_GLOW));
    // A sweep in the beat before the section lands, and every other bar of a loud one. Its colours
    // are the ones the props come back in: the bar's, or a mood's two halves.
    const sweepInto = (t: number) => {
      const fromRight = sweeps.length % 2 === 1;
      const half = (x: number) => moodPair({ ...house!, prop: { ...house!.prop, x } }, t)[0];
      const [left, right] = mood ? [half(0.25), half(0.75)] : [houseColour(t), houseColour(t)];
      sweeps.push({ t, fromRight, head: mood ? "#ffffff" : flashColour(t), tail: fromRight ? [left, right] : [right, left] });
    };
    if (canSweep && si > 0 && barStarts[0] !== undefined) sweepInto(barStarts[0]);
    if (canSweep && loud) for (let b = 2; b < barStarts.length; b += 2) sweepInto(barStarts[b]!);

    // 1. Lit or dark. Heroes carry the song; every other role comes in to mark sections, more of
    // them the louder the section, up to the corpus's busy-phrase share of the house. A show's
    // loudest parts light all of it; its quiet ones light the outlines and windows alone.
    let order = lookRoles.get(sp.look);
    if (!order) {
      // A show is conducted: its roles come in as the music builds, the frame of the house first
      // and the biggest ensembles before the solo props, the same way every time.
      // Elsewhere roles that have sat out the looks so far move up, so every role gets its sections.
      order = show ? roles.filter((r) => tierOf(r) !== "hero" && r !== "whole_house").sort((a, b) => ENTRY_ORDER[tierOf(a)] - ENTRY_ORDER[tierOf(b)] || roleProps(b) - roleProps(a) || a.localeCompare(b)) : weightedOrder(roles.filter((r) => tierOf(r) !== "hero" && r !== "whole_house"), (r) => (priors.roles[r]?.coverage.p50 ?? 0.1) * (litLooks.get(r) ? 1 / (1 + 2 * litLooks.get(r)!) : 6), seed, `lit:${sp.look}`);
      lookRoles.set(sp.look, order);
    }
    // From under the corpus's quietest-phrase median to its busiest: a lit role covers its whole
    // section here, where the corpus's flicker on and off inside one, so the same share of rows
    // gives more light.
    // A show's loud sections are the whole orchestra: every role plays. Its quieter ones lie on the
    // bed, and without one light the share below, the frame of the house first.
    const target = show && loud ? Infinity : (LIT_SHARE_MIN + (LIT_SHARE_MAX - LIT_SHARE_MIN) * sp.intensity) * totalProps;
    const lit = new Set<Role>(roles.filter((r) => (tierOf(r) === "hero" && sp.intensity >= 0.2) || sp.featured.includes(r)));
    let litRows = [...lit].reduce((n, r) => n + roleProps(r), 0);
    for (const role of order) {
      if (litRows >= target) break;
      if (lit.has(role)) continue;
      // Not all of it: a role that would take the section well past its share waits for a section
      // that wants it, and a smaller one may fit instead.
      if (litRows > 0 && litRows + roleProps(role) > target * 1.05) continue;
      lit.add(role);
      litRows += roleProps(role);
    }
    if (!countedLooks.has(sp.look)) {
      countedLooks.add(sp.look);
      for (const role of lit) litLooks.set(role, (litLooks.get(role) ?? 0) + 1);
    }
    // No whole-house wash of one colour: it lit every prop at once (Logan, 2026-10-10: most of it,
    // not all of it, most of the time). The bed is a moving picture instead, and only where the
    // props step aside for it.
    if (bed && sectionShader) {
      for (const r of [...lit]) if (r === "whole_house" || (tierOf(r) !== "hero" && !sp.featured.includes(r))) lit.delete(r);
      const start = beatTime(firstBeat);
      // Straight in after a sweep: the sweep has already filled the house with colour.
      drafts.push({ unit: house!, layer: 0, startMs: start, endMs: beatTime(endBeat), name: "Shader", params: shaderParams(sectionShader), palette: bedPalette(house!, start), ...(canSweep && si > 0 ? { fadeInMs: 0 } : {}) });
    }

    // 2-4. Per phrase (4 bars), one family per role, re-triggered on the grid, coordinated.
    const phraseBeats: number[] = [firstBeat];
    for (let i = 4; i < barStarts.length; i += 4) if (barStarts.length - i >= 2) phraseBeats.push(beatAtOrAfter(song.beats, barStarts[i]!));
    phraseBeats.push(endBeat);

    for (const role of lit) {
      const roleUnits = units.get(role)!;
      let families = (sp.families[role] ?? ROLE_EFFECTS[role].slice(0, 3)).filter((n) => ROLE_EFFECTS[role].includes(n) && !avoid.has(n) && !(show && RANDOM_FLASH.has(n)));
      if (families.length === 0 && show && ROLE_EFFECTS[role].includes("On") && !avoid.has("On")) families = ["On"];
      if (families.length === 0) continue;
      for (let p = 0; p + 1 < phraseBeats.length; p++) {
        const [from, to] = [phraseBeats[p]!, phraseBeats[p + 1]!];
        const pick = keyedRandom(seed, `family:${sp.look}:${role}:${p}`);
        const weights = [0.55, 0.3, 0.15].slice(0, families.length);
        let acc = 0, chosen = families[0]!;
        for (let i = 0; i < weights.length; i++) {
          acc += weights[i]! / weights.reduce((a, b) => a + b, 0);
          if (pick < acc) { chosen = families[i]!; break; }
        }
        roleUnits.forEach((unit, k) => {
          const [primary, partner] = pairs.get(role)!;
          // Alternate motion alternates the pair along the role's props.
          const pair = sp.motion === "alternate" && k % 2 ? [partner, primary] : [primary, partner];
          // The 2D heroes and the whole house rotate their phrases through a library shader and,
          // on a matrix, a picture of the song's motif, so every look shows each.
          const beats = to - from;
          // A show keeps its showpieces for the middle: quiet parts are thin, and its loud parts
          // are one colour a bar, which a phrase-long shader can't follow. The matrix is a
          // screen and keeps its pictures when loud.
          // A show's heroes play shaders all song, its soloists over the house (Logan, 2026-10-10:
          // more of the high-fidelity shaders); classic keeps them for the middle sections.
          const canShader = usable.length > 0 && unit.prop.dims === 2 && (role === "whole_house" || (unit.prop.tier === "hero" && role !== "singing_face")) && (show || (!loud && !quiet)) && !avoid.has("Shader");
          const canPicture = motifs.length > 0 && role === "matrix" && unit.prop.dims === 2 && unit.prop.nodes >= 200 && !quiet && !avoid.has("Pictures");
          const kinds = role === "whole_house" && !loud ? ["shader"] : [...(canPicture ? ["picture"] : []), ...(show && canShader ? [] : ["family"]), ...(canShader ? ["shader"] : [])];
          let kind = kinds[(p + lookNo) % kinds.length]!;
          if ((kind === "shader" && !canShader) || (kind === "picture" && picturesLeft <= 0)) kind = "family";
          if (kind === "shader") {
            // A show plays one shader on its heroes and its bed, so the house reads as one picture:
            // over a bed, a hero with nothing else to play holds it the whole section in the bed's
            // colours rather than restarting it every phrase.
            const whole = show && bed && kinds.length === 1;
            if (whole && p > 0) return;
            const shader = show ? sectionShader! : shaderList[(lookNo * 3 + (role === "matrix" ? 1 : role === "whole_house" ? 2 : 0)) % shaderList.length]!;
            const start = beatTime(from);
            drafts.push({ unit, layer: 0, startMs: start, endMs: beatTime(whole ? endBeat : to), name: "Shader", params: shaderParams(shader), palette: !show ? [...pair, accent].map(shade) : bed ? bedPalette(whole ? house! : unit, start) : shaderPalette(unit, start) });
            return;
          }
          if (kind === "picture") {
            const motif = motifs[lookNo % motifs.length]!;
            const colours = mood ? [...moodPair(unit, beatTime(from)), "#ffffff"] : show ? [houseColour(beatTime(from)), contrastColour(beatTime(from)), "#ffffff"] : [...pair, accent];
            const imageKey = `${motif}|${colours.join()}`;
            const image = images.get(imageKey) ?? images.set(imageKey, drawMotif(motif, colours)).get(imageKey)!;
            // Quiet: the picture grows in. Mid: it sways a bar at a time. Loud: it peeks up or
            // scrolls across, a pass every two bars.
            const bars = Math.max(1, Math.round(beats / song.beatsPerBar));
            const [movement, speed, fade] = sp.intensity < 0.4 ? ["zoom in", 1, 2] as const
              : sp.intensity < 0.75 ? ["wiggle", bars, 1] as const
              : [p % 2 ? "peekaboo" : lookNo % 2 ? "left" : "right", Math.max(1, Math.round(bars / 2)), p % 2 ? 1 : 0] as const;
            const params = { ...defaultParamsFor("Pictures"), image, movement, speed, scaleMode: "fit" };
            const fadeMs = fade * beatMs;
            drafts.push({ unit, layer: 0, startMs: beatTime(from), endMs: beatTime(to), name: "Pictures", params, palette: [], ...(fadeMs ? { fadeInMs: fadeMs, fadeOutMs: fadeMs } : {}) });
            picturesLeft--;
            return;
          }
          // A show's loud parts paint the frame of the house, the fills and the focal prop solid
          // in the bar's colour, the way a produced show floods its roofline and windows; the
          // features and heroes move inside that.
          // The frame floods on alternate phrases and runs its own effect in the bar's colour on the
          // others, so the roofline answers the chorus rather than sitting solid through all of it.
          const solid = loud && !mood && ((unit.prop.tier === "frame" && (p + lookNo) % 2 === 0) || unit.prop.tier === "fill" || focal.has(unit)) && ROLE_EFFECTS[role].includes("On");
          const name = solid ? "On" : unit.prop.dims === 1 && TWO_D_ONLY.has(chosen) ? families.find((f) => !TWO_D_ONLY.has(f)) : chosen;
          if (!name) return;
          const punctual = PUNCTUAL.has(name);
          // Punctual effects trigger a beat apart when the section is loud, a bar or two apart when
          // it is quiet. Textures run their corpus length back to back.
          let interval = punctual ? punctualInterval(sp.intensity, unit.prop.tier, sp.featured.includes(role), song.bpm) : textureBeats(name);
          // A show's loud blocks hold their colour, so only the roles carrying the section
          // re-trigger inside the bar; the white flashes mark the beat. Nothing in a show runs
          // across a change of colour.
          if (loud && punctual && !mood) interval = Math.max(interval, sp.featured.includes(role) && unit.prop.tier !== "hero" ? 2 : song.beatsPerBar);
          if (show) interval = Math.min(interval, period * song.beatsPerBar);
          interval = Math.max(step, Math.ceil(interval / step) * step);
          // Motion: a sweep across the role's props, one prop per beat.
          const n = roleUnits.length;
          const position = sp.motion === "right-to-left" ? n - 1 - k : sp.motion === "centre-out" ? Math.round(Math.abs(unit.prop.x - 0.5) * 2 * (n - 1)) : k;
          let phase = 0;
          if (show && (sp.motion === "left-to-right" || sp.motion === "right-to-left" || sp.motion === "centre-out")) {
            // A show sweeps across the whole front of the house, not along one role: the house is
            // cut into a zone per beat of the bar, and each zone comes in a beat after the last.
            const zones = song.beatsPerBar;
            const zone = (x: number) => Math.min(zones - 1, Math.floor(Math.max(0, x) * zones));
            const z = sp.motion === "right-to-left" ? zones - 1 - zone(unit.prop.x) : sp.motion === "centre-out" ? zone(Math.abs(unit.prop.x - 0.5) * 2) : zone(unit.prop.x);
            if (punctual) interval = Math.max(interval, zones * step);
            phase = z * step;
          } else if (n > 1 && sp.motion !== "unison" && !halves) {
            if (punctual) {
              const cycle = sp.motion === "alternate" ? 2 : Math.min(n, song.beatsPerBar);
              interval = Math.max(interval, cycle * step);
              phase = sp.motion === "alternate" ? (k % 2) * step : (position % cycle) * step;
            } else phase = Math.min(position, song.beatsPerBar - 1) * step;
          }
          let variation = 0;
          // A prop whose turn in a sweep comes later in the phrase holds its colour dimly until
          // then rather than sitting dark (a slow song's sweep takes a bar a prop).
          if (phase > 0 && !solid && ROLE_EFFECTS[role].includes("On") && !avoid.has("On")) {
            const lead = show ? (mood ? moodPair(unit, beatTime(from))[0] : houseColour(beatTime(from))) : shade(pair[0]!);
            drafts.push({ unit, layer: 0, startMs: beatTime(from), endMs: beatTime(Math.min(from + phase, to)), name: "On", params: { ...defaultParamsFor("On"), startIntensity: 100, endIntensity: 100 }, palette: [dim(lead, 0.35)] });
          }
          for (let b = from + phase; b < to; b += interval) {
            // A punctual effect on a prop that comes and goes lasts at most two beats (a bar on the
            // slow songs' bar grid) and leaves the
            // rest of its slot dark, the way the corpus's one-beat effects do; that gap is what
            // makes the next trigger read as a beat. Heroes, lit all song, fill their slot, and so
            // does everything in a show's loud parts: the house holds the bar's colour as a block.
            const end = Math.min(b + (punctual && unit.prop.tier !== "hero" && (!loud || mood) ? Math.min(interval, step === 1 ? 2 : step) : interval), to);
            const startMs = beatTime(b), endMs = beatTime(end);
            if (endMs <= startMs) continue;
            if (halves && unit.prop.tier !== "hero" && (unit.prop.x < 0.5 ? 0 : 1) !== slot(startMs) % 2) continue;
            const { params, layer } = effectParams(name, end - b, variation + (sp.motion === "right-to-left" ? 1 : 0), feel, options.title);
            // A solid block holds steady: the bar's change of colour and the flashes are the beat.
            if (solid) params.endIntensity = params.startIntensity ?? 100;
            const size = Math.max(1, Math.min(2, priors.palette.sizeByEffect[nativeEffectName(name)] ?? 1));
            // A re-triggered effect swaps the pair on each trigger, so the beat shows as a
            // two-colour pattern; a texture holds it. A show wears the house's one colour, the
            // focal prop (and every other prop under "alternate") the contrast.
            const colors = mood ? [moodPair(unit, startMs)[0]] : show
              ? [focal.has(unit) || (sp.motion === "alternate" && k % 2) ? contrastColour(startMs) : houseColour(startMs)]
              : [...new Set((punctual && variation % 2 ? [pair[1]!, pair[0]!] : pair).slice(0, size))].map(shade);
            // A pulse that comes and goes dies away in the quieter sections, and breathes in as
            // well in the quietest; the loud ones cut.
            // The rest of the slot holds the colour dimly rather than going dark (Logan, 2026-10-10:
            // most of the display lit most of the time), so the beat reads as bright against dim.
            const holdTo = Math.min(beatTime(Math.min(b + interval, to)), section.endMs);
            // Over a bed the slot stays empty instead, so the bed shows between the beats.
            const hold = !bed && holdTo - endMs >= beatMs / 2 && ROLE_EFFECTS[role].includes("On") && !avoid.has("On");
            const pulse = punctual && unit.prop.tier !== "hero" && sp.intensity < 0.5 ? { ...(hold ? {} : { fadeOutMs: (endMs - startMs) / 2 }), ...(sp.intensity < 0.35 ? { fadeInMs: (endMs - startMs) / 3 } : {}) } : {};
            drafts.push({ unit, layer: 0, startMs, endMs, name, params, palette: colors, ...(layer ? { layerSettings: layer } : {}), ...pulse });
            if (hold) {
              const still = { ...defaultParamsFor("On"), startIntensity: 100, endIntensity: 100 };
              drafts.push({ unit, layer: 0, startMs: endMs, endMs: holdTo, name: "On", params: still, palette: [dim(colors[0] ?? "#ffffff", 0.35)] });
            }
            variation++;
          }
        });
      }
    }

    // 7. Heroes take a third layer in the loud sections: a texture at low mix over their base
    // (the corpus's mega trees and matrices run 2 layers at the median, 6-7 at p90). Not in a show:
    // a twinkle or shimmer over a shader is flashing at random, which a show never does.
    if (!show && sp.intensity >= 0.75) {
      for (const unit of [...lit].flatMap((r) => units.get(r)!).filter((u) => u.prop.tier === "hero" && u.prop.dims === 2)) {
        const name = ["Twinkle", "Shimmer"].find((n) => ROLE_EFFECTS[unit.prop.role].includes(n) && !avoid.has(n));
        if (!name) continue;
        for (let p = 0; p + 1 < phraseBeats.length; p++) {
          const [from, to] = [phraseBeats[p]!, phraseBeats[p + 1]!];
          const { params } = effectParams(name, to - from, p, feel, options.title);
          drafts.push({ unit, layer: 2, startMs: beatTime(from), endMs: beatTime(to), name, params, palette: [show ? "#ffffff" : accent], mix: 0.6 });
        }
      }
    }

    // 5. Accents on a second layer: short pulses on the heroes and the frame of the house.
    if (sp.accents !== "none") {
      let times: number[] = [];
      // A show flashes white on the backbeats, the way a snare cracks (above 130 BPM on the last
      // beat of the bar alone); classic takes every beat.
      const backbeat = (pos: number) => (song.bpm >= 130 ? pos === song.beatsPerBar - 1 : pos % 2 === 1);
      if (sp.accents === "beats" && step === 1) times = song.beats.slice(firstBeat, endBeat).filter((_, j) => !show || backbeat(beatInBar[firstBeat + j]!));
      else if (sp.accents === "hits" && step === 1) {
        let last = -Infinity;
        for (const hit of song.hits) {
          if (hit.ms < section.startMs || hit.ms >= section.endMs || hit.strength < 0.6 || hit.band === "hat") continue;
          const b = beatAtOrAfter(song.beats, hit.ms - beatMs / 4);
          const t = beatTime(b);
          if (Math.abs(t - hit.ms) > beatMs / 4 || t - last < beatMs - 1) continue;
          times.push(t);
          last = t;
        }
      } else times = barStarts.slice();
      // The heroes take the downbeats; beat and hit accents go to the frame of the house when it
      // is carrying the section, and in a show to the whole frame and the focal prop.
      const bars = barStarts;
      const framing = (u: Unit) => sp.accents !== "downbeats" && (show ? u.prop.tier === "frame" || focal.has(u) : u.prop.tier === "frame" && sp.featured.includes(u.prop.role));
      // A show's heroes play their shader through: the beat is the house's to mark.
      const accentUnits = [...lit].flatMap((r) => units.get(r)!).filter((u) => (!show && u.prop.tier === "hero" && u.prop.dims === 2 && u.prop.role !== "singing_face") || framing(u));
      for (const unit of accentUnits) {
        const own = unit.prop.tier === "hero" ? bars : times;
        // A flash, never a ring: Logan (2026-10-10) asked for fewer shockwaves.
        const name = ROLE_EFFECTS[unit.prop.role].includes("On") ? "On" : undefined;
        if (!name) continue;
        own.forEach((t, i) => {
          const next = own[i + 1] ?? section.endMs;
          // A show's flash is half a beat: a crack, then the colour again. A mood's flashes are
          // the other half's colour, which kept to the family and marked the beat better than
          // white on the test songs.
          const endMs = Math.min(t + (show ? beatMs / 2 : beatMs), next, section.endMs);
          if (endMs - t < frameMs) return;
          const { params } = effectParams(name, 1, i, feel, options.title);
          // Accents all wear the accent colour; an On accent decays unless the section is loud.
          drafts.push({ unit, layer: 1, startMs: t, endMs, name, params, palette: [mood ? moodPair(unit, t)[1] : show ? flashColour(t) : accent], ...(name === "On" && sp.intensity < 0.75 ? { fadeOutMs: (endMs - t) / 2 } : {}) });
        });
      }
    }

    litBySection[si] = new Set([...[...lit].flatMap((r) => units.get(r)!), ...(bed ? [house!] : [])]);
  });

  // Fades only where a prop goes to or comes from dark: between two effects on one prop a fade
  // would dip to black mid-song. Quiet entrances and exits take two beats, the rest one; a prop
  // that comes in on a loud section, or goes out as the music jumps, cuts on the downbeat.
  song.sections.forEach((section, si) => {
    const sp = planOf(si);
    const inside = drafts.filter((d) => d.layer === 0 && d.name !== "Off" && d.startMs >= section.startMs - 1 && d.startMs < section.endMs - 1);
    const next = si + 1 < song.sections.length ? planOf(si + 1) : undefined;
    for (const unit of litBySection[si] ?? []) {
      const mine = inside.filter((d) => d.unit === unit);
      const first = mine[0], last = mine[mine.length - 1];
      if (first && !litBySection[si - 1]?.has(unit) && sp.intensity < 0.75 && !PUNCTUAL.has(first.name) && first.fadeInMs === undefined) {
        first.fadeInMs = (sp.intensity < 0.4 ? 2 : 1) * beatMs * step;
      }
      if (last && next && !litBySection[si + 1]?.has(unit) && next.intensity <= sp.intensity + 0.15) {
        last.fadeOutMs = Math.max(last.fadeOutMs ?? 0, (next.intensity < sp.intensity - 0.15 ? 2 : 1) * beatMs);
      }
    }
  });

  // A mood closes on the house twinkling a dim white and fading away, the reference video's last
  // ten seconds: the last four bars at most, unless the song ends loud. Full white there lit the
  // house brighter than the song's quiet ending and cost the fit score its loudness parts.
  const tail = song.sections[song.sections.length - 1];
  let closeFrom = Infinity;
  if (mood && tail && !loudness[song.sections.length - 1] && !avoid.has("Twinkle")) {
    const from = song.downbeats.find((d) => d >= Math.max(tail.startMs, song.durationMs - 4 * song.beatsPerBar * beatMs) - 1) ?? tail.startMs;
    closeFrom = from;
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]!;
      if (d.startMs >= from - 1) drafts.splice(i, 1);
      else if (d.endMs > from) { d.endMs = from; delete d.fadeOutMs; }
    }
    const { params } = effectParams("Twinkle", (song.durationMs - from) / beatMs, 0, feel, options.title);
    for (const unit of allUnits) {
      if (!ROLE_EFFECTS[unit.prop.role].includes("Twinkle") || unit.prop.role === "whole_house" || unit.prop.role === "flood") continue;
      drafts.push({ unit, layer: 0, startMs: from, endMs: song.durationMs, name: "Twinkle", params: { ...params }, palette: [dim("#ffffff", 0.3)], fadeInMs: song.beatsPerBar * beatMs });
    }
  }

  // Pictures from the lyrics: a line that names something the library draws (a reindeer, a
  // sleigh, boots on the roof) puts it on the matrix while the line is sung, moving the way it
  // moves, and takes the matrix from whatever was planned there. From the beat nearest the
  // line's start to the beat after it ends, two beats at least and four bars at most.
  const screens = (units.get("matrix") ?? []).filter((u) => u.prop.dims === 2 && u.prop.nodes >= 200);
  // Which lines, and what: the AI director's choice when it read the lyrics (a library drawing,
  // else one an image model drew for it), otherwise whatever each line's own words name.
  const lyricPictures: { line: { startMs: number; endMs: number }; sprite?: Sprite; drawn?: string; subject?: string }[] = plan.pictures
    ? plan.pictures.flatMap((p) => {
      const line = options.lyrics?.[p.line];
      const sprite = p.library ? spriteById(p.library) : undefined;
      const drawn = sprite ? undefined : options.drawn?.get(p.subject);
      return line && (sprite || drawn) ? [{ line, ...(sprite ? { sprite } : {}), ...(drawn ? { drawn, subject: p.subject } : {}) }] : [];
    }).sort((a, b) => a.line.startMs - b.line.startMs)
    : (options.lyrics ?? []).flatMap((line) => {
      const sprite = spriteFor(line.label);
      return sprite ? [{ line, sprite }] : [];
    });
  if (screens.length && lyricPictures.length && !avoid.has("Pictures")) {
    let shown = 0, lastEnd = 0;
    for (const { line, sprite, drawn, subject } of lyricPictures) {
      if (shown >= MAX_LYRIC_PICTURES) break;
      const from = Math.max(lastEnd, beatTime(beatAtOrAfter(song.beats, line.startMs - beatMs / 2)));
      const to = Math.min(Math.max(beatTime(beatAtOrAfter(song.beats, line.endMs)), from + 2 * beatMs), from + 4 * song.beatsPerBar * beatMs, song.durationMs);
      if (to - from < beatMs) continue;
      // A drawing travels like a sprite that travels when its subject names one (a reindeer runs,
      // a sleigh flies); "a fox in the snow" naming the snowflake says nothing, so it bounces. A
      // bounce hops on every other beat and a sway takes a bar; the rest go across once.
      const borrowed = spriteFor(subject ?? "")?.movement;
      const movement = sprite?.movement ?? (borrowed === "right" || borrowed === "left" || borrowed === "fly" ? borrowed : "bounce");
      const beats = (to - from) / beatMs;
      const speed = movement === "bounce" ? Math.max(1, Math.round(beats / 2)) : movement === "wiggle" ? Math.max(1, Math.round(beats / song.beatsPerBar)) : 1;
      const params = sprite
        ? { ...defaultParamsFor("Pictures"), picture: `lib:${sprite.id}`, movement, speed, fps: sprite.fps, scaleMode: "fit" }
        : { ...defaultParamsFor("Pictures"), pictureData: drawn!, movement, speed, scaleMode: "fit" };
      for (const unit of screens) {
        const kept = carve(drafts.filter((d) => d.unit === unit), from, to);
        const others = drafts.filter((d) => d.unit !== unit);
        drafts.length = 0;
        drafts.push(...others, ...kept, { unit, layer: 0, startMs: from, endMs: to, name: "Pictures", params, palette: [] });
      }
      shown++;
      lastEnd = to;
    }
  }

  // A singing face with a face definition sings the lyric track all song, its mouth on the
  // phonemes and its eyes blinking, in place of its own effects and texture (the corpus's
  // singing faces spend 52% of their time on Faces). A sub-model face (the face on a singing
  // tree) sings with its parent's definition, which renders renumbered into its own nodes.
  const faceOf = (u: Unit) => (u.prop.role === "singing_face" ? options.singing?.faces.get(u.elementType === "submodel" ? `model:${u.elementId}` : u.prop.key) : undefined);
  const singers = allUnits.filter((u) => faceOf(u) !== undefined);
  if (singers.length) {
    for (let i = drafts.length - 1; i >= 0; i--) if (singers.includes(drafts[i]!.unit) && drafts[i]!.layer !== 1) drafts.splice(i, 1);
    for (const unit of singers) {
      const params = { ...defaultParamsFor("Faces"), faceDefinition: faceOf(unit)!, useTimingTrack: true, timingTrack: options.singing!.track, eyes: "Automatic" };
      drafts.push({ unit, layer: 0, startMs: 0, endMs: song.durationMs, name: "Faces", params, palette: [] });
    }
  }

  // Any other prop with a face definition is a singing tree (a mega or mini tree with a face drawn
  // on its lights; its name rarely says so, so its role is a tree). It sings each sung line: a dim
  // wash of the section's colour hides its part in the show, and its face sings over that, from
  // the beat before the line to the beat after it. Between lines it plays its part, which runs on
  // underneath, so a shader doesn't restart. When a role group carries the tree, the face goes on
  // the tree's own row, which renders over the group's.
  const facesByKey = options.singing?.faces ?? new Map<string, string>();
  const sungLines = (options.lyrics ?? []).filter((l) => l.label.trim() && l.endMs > l.startMs).sort((a, b) => a.startMs - b.startMs);
  const spans: [number, number][] = [];
  for (const line of sungLines) {
    const from = beatTime(Math.max(0, beatAtOrAfter(song.beats, line.startMs) - 1));
    const to = Math.min(song.durationMs, beatTime(beatAtOrAfter(song.beats, line.endMs)));
    const last = spans[spans.length - 1];
    // Lines a bar or less apart are one breath: the face doesn't blink out between them.
    if (last && from - last[1] <= song.beatsPerBar * beatMs) last[1] = Math.max(last[1], to);
    else if (to > from) spans.push([from, to]);
  }
  if (!sungLines.length) spans.push([0, song.durationMs]);
  [...facesByKey].forEach(([key, faceDefinition], i) => {
    const prop = props.find((p) => p.key === key);
    const id = Number(key.split(":")[1]);
    if (!prop || prop.role === "singing_face" || singers.some((u) => u.elementType === "submodel" && u.elementId === id)) return;
    const unit = allUnits.find((u) => u.prop.key === key) ?? { prop, elementType: "model" as const, elementId: id, order: allUnits.length + i };
    for (const [from, to] of spans) {
      const si = Math.max(0, song.sections.findIndex((sec) => from >= sec.startMs - 1 && from < sec.endMs - 1));
      const lead = (plan.palettes[planOf(si).palette] ?? ["#ffffff"])[0]!;
      drafts.push({ unit, layer: 2, startMs: from, endMs: to, name: "On", params: { ...defaultParamsFor("On"), startIntensity: 100, endIntensity: 100 }, palette: [dim(lead, 0.2)] });
      drafts.push({ unit, layer: 3, startMs: from, endMs: to, name: "Faces", params: { ...defaultParamsFor("Faces"), faceDefinition, useTimingTrack: true, timingTrack: options.singing!.track, eyes: "Automatic" }, palette: ["#ffffff", "#ffffff", lead] });
    }
  });

  // Whole-house hits: where the plan asks and where the song jumps on a downbeat, rationed to the
  // corpus's p75 of about 1.5 a minute. Every prop takes it, on the accent layer.
  const allowedHits = Math.max(1, Math.floor((priors.structure.bigHitsPerMinute.p75 * song.durationMs) / 60000));
  const candidates: number[] = [];
  // Hits that land as the music jumps up; a show goes dark for the beat before them.
  const drops = new Set<number>();
  for (const sp of plan.sections) {
    if (!sp.wholeHouseHit || !song.sections[sp.index]) continue;
    candidates.push(song.sections[sp.index]!.startMs);
    if (sp.index > 0 && sp.intensity >= planOf(sp.index - 1).intensity + 0.15) drops.add(song.sections[sp.index]!.startMs);
  }
  for (const ms of song.impacts) {
    const b = beatAtOrAfter(song.downbeats, ms - beatMs / 4);
    const db = song.downbeats[b];
    const rising = (song.energy[beatAtOrAfter(song.beats, ms + beatMs)] ?? 0) > (song.energy[Math.max(0, beatAtOrAfter(song.beats, ms - 2 * beatMs))] ?? 0) + 0.15;
    if (db !== undefined && Math.abs(db - ms) <= beatMs / 4 && rising) {
      candidates.push(db);
      drops.add(db);
    }
  }
  const hits: number[] = [];
  for (const t of candidates) {
    if (hits.length >= allowedHits) break;
    if (t <= 0 || t >= song.durationMs - beatMs || hits.some((h) => Math.abs(h - t) < 16 * beatMs)) continue;
    hits.push(t);
  }
  const lastBar = plan.ending === "hit-then-dark" ? [...song.downbeats].reverse().find((d) => d <= song.durationMs - 2 * beatMs) : undefined;
  if (plan.ending === "hit-then-dark") {
    if (lastBar !== undefined) {
      for (const d of drafts) if (d.startMs >= lastBar) d.endMs = d.startMs; else if (d.endMs > lastBar) d.endMs = lastBar;
      hits.push(lastBar);
    }
  }
  for (const t of hits) {
    const last = t === hits[hits.length - 1] && plan.ending === "hit-then-dark";
    const length = last ? 2 * beatMs : beatMs;
    // The whole house flashes the accent of the section it lands in, and the last hit dies away.
    const si = Math.max(0, song.sections.findIndex((s) => t >= s.startMs - 1 && t < s.endMs - 1));
    const sectionPalette = plan.palettes[planOf(si).palette] ?? ["#ffffff"];
    const hitColour = show ? "#ffffff" : sectionPalette[sectionPalette.length - 1] ?? "#ffffff";
    for (const unit of allUnits) {
      if (unit.prop.role === "whole_house") continue;
      for (const d of drafts) if (d.unit === unit && d.layer === 1 && d.endMs > t && d.startMs < t + length) d.endMs = d.startMs; // the hit replaces accents
      const name = "On";
      const { params } = effectParams(name, 1, 0, feel, options.title);
      drafts.push({ unit, layer: 1, startMs: t, endMs: Math.min(t + length, song.durationMs), name, params, palette: [hitColour], hit: true, ...(last ? { fadeOutMs: 1.5 * beatMs } : {}) });
    }
  }

  // The sweeps: the next colour wipes across the whole house on its group, a bright edge leading
  // it, landing on the downbeat. Each prop lets go of its colour as the edge reaches it, so the
  // wipe shows, and comes back in the new colour on the downbeat (every start stays on the grid).
  // The heroes play on through it: they are the soloists, and a shader cut in two would jump. Not
  // into the dark beat before a drop, a rest, or the mood's closing twinkle.
  if (house && sweeps.length) {
    const length = (song.bpm >= 130 ? 2 : 1) * beatMs;
    const carried = allUnits.filter((u) => u !== house && u.prop.tier !== "hero" && inHouse(u));
    const byUnit = new Map<Unit, Draft[]>();
    for (const d of drafts) (byUnit.get(d.unit) ?? byUnit.set(d.unit, []).get(d.unit)!).push(d);
    for (const sweep of sweeps) {
      const from = sweep.t - length;
      if (from <= 0 || sweep.t >= closeFrom || (lastBar !== undefined && sweep.t > lastBar)) continue;
      if ((hits.includes(sweep.t) && drops.has(sweep.t)) || (song.rests ?? []).some((r) => r.startMs < sweep.t && r.endMs > from)) continue;
      for (const u of carried) byUnit.set(u, carve(byUnit.get(u) ?? [], from + (sweep.fromRight ? 1 - u.prop.x : u.prop.x) * length, sweep.t));
      const params = { ...defaultParamsFor("Morph"), x1a: 0, y1a: 0, x1b: 0, y1b: 100, x2a: 100, y2a: 0, x2b: 100, y2b: 100, headLength: 15, headDuration: 100, swapStartEnd: sweep.fromRight };
      (byUnit.get(house) ?? byUnit.set(house, []).get(house)!).push({ unit: house, layer: 1, startMs: from, endMs: sweep.t, name: "Morph", params, palette: [sweep.head, ...sweep.tail] });
    }
    drafts.length = 0;
    drafts.push(...[...byUnit.values()].flat());
  }

  if (plan.ending === "fade") {
    const tail = song.sections[song.sections.length - 1];
    for (const d of drafts) if (tail && d.layer === 0 && d.endMs >= song.durationMs - 2 * beatMs && d.startMs >= tail.startMs) d.fadeOutMs = Math.min(4 * beatMs, (d.endMs - d.startMs) * 0.75);
  } else if (plan.ending === "hold") {
    const lastByUnit = new Map<Unit, Draft>();
    for (const d of drafts) if (d.layer === 0) lastByUnit.set(d.unit, d);
    for (const d of lastByUnit.values()) if (d.endMs >= song.durationMs - 4 * beatMs) d.endMs = song.durationMs;
  }
  // A show goes dark where the music stops, and for the beat before a drop lands.
  let placed: Draft[] = drafts;
  if (show) {
    for (const rest of song.rests ?? []) placed = carve(placed, rest.startMs, rest.endMs);
    for (const t of hits) if (drops.has(t) && t > beatMs) placed = carve(placed, t - beatMs, t);
  }
  // A picture plays alone: no accents or texture over it, short of a whole-house hit.
  const pictures = placed.filter((d) => d.name === "Pictures");
  const shown = placed.filter((d) => d.layer === 0 || d.hit || !pictures.some((p) => p.unit === d.unit && p.startMs < d.endMs && d.startMs < p.endMs));

  return finish(shown, song, frameMs, seed, totalRows, show);
}

/**
 * Frame-snap, keep layers non-overlapping, and thin moments where too much of the house starts at
 * once. A show's bar lines are exempt: its loud parts change colour together on purpose.
 */
function finish(drafts: Draft[], song: SongMap, frameMs: number, seed: number, totalRows: number, show = false): Placement[] {
  const snap = (ms: number) => Math.max(0, Math.min(song.durationMs, Math.round(ms / frameMs) * frameMs));
  let live = drafts.map((d) => ({ ...d, startMs: snap(d.startMs), endMs: snap(d.endMs) })).filter((d) => d.endMs - d.startMs >= frameMs);
  const lane = (d: Draft) => `${d.unit.prop.key}|${d.layer}`;

  const resolveOverlaps = () => {
    const byLane = new Map<string, Draft[]>();
    for (const d of live) (byLane.get(lane(d)) ?? byLane.set(lane(d), []).get(lane(d))!).push(d);
    const kept: Draft[] = [];
    for (const list of byLane.values()) {
      // A whole-house hit wins its slot; otherwise the earlier effect is cut where the next begins.
      list.sort((a, b) => a.startMs - b.startMs || Number(b.hit ?? false) - Number(a.hit ?? false));
      for (const d of list) {
        const prev = kept[kept.length - 1];
        if (prev && lane(prev) === lane(d) && prev.endMs > d.startMs) {
          if (prev.hit && !d.hit) { d.startMs = prev.endMs; if (d.endMs - d.startMs < frameMs) continue; }
          else { prev.endMs = d.startMs; if (prev.endMs - prev.startMs < frameMs) kept.pop(); }
        }
        kept.push(d);
      }
    }
    live = kept;
  };
  resolveOverlaps();

  // The corpus's big hit: 40% of the rows in use (at least 4) starting within a frame of each
  // other. Only planned hits may do that; anywhere else the lowest-priority re-triggers merge into
  // the effect before them on their row (held across the beat, whatever it is) until the moment
  // is below it. A start with nothing before it to hold stays: dropping it left the prop dark for
  // its whole slot, a phrase on a slow song, and most of the display is meant to be lit.
  const rowsInUse = new Set(live.map((d) => d.unit.prop.key)).size || totalRows;
  const cap = Math.max(4, Math.ceil(0.4 * rowsInUse)) - 1;
  const buckets = new Map<number, Draft[]>();
  const bars = new Set(show ? song.downbeats.map(snap) : []);
  for (const d of live) if (!d.hit && !bars.has(d.startMs)) (buckets.get(d.startMs) ?? buckets.set(d.startMs, []).get(d.startMs)!).push(d);
  const removed = new Set<Draft>();
  for (const [ms, list] of buckets) {
    const rows = new Map<string, Draft[]>();
    for (const d of list) (rows.get(d.unit.prop.key) ?? rows.set(d.unit.prop.key, []).get(d.unit.prop.key)!).push(d);
    if (rows.size <= cap) continue;
    const before = (d: Draft) => live.find((x) => !removed.has(x) && lane(x) === lane(d) && x.endMs === d.startMs);
    const victims = [...rows.keys()].filter((key) => rows.get(key)!.every((d) => before(d))).sort((a, b) => TIER_PRIORITY[rows.get(a)![0]!.unit.prop.tier] - TIER_PRIORITY[rows.get(b)![0]!.unit.prop.tier] || keyedRandom(seed, `thin:${ms}:${a}`) - keyedRandom(seed, `thin:${ms}:${b}`));
    for (const key of victims.slice(0, rows.size - cap)) {
      for (const d of rows.get(key)!) {
        before(d)!.endMs = d.endMs;
        removed.add(d);
      }
    }
  }
  live = live.filter((d) => !removed.has(d));

  return live
    .sort((a, b) => a.unit.order - b.unit.order || a.unit.prop.key.localeCompare(b.unit.prop.key) || a.layer - b.layer || a.startMs - b.startMs)
    .map((d) => {
      const transition: SequenceEffect["transition"] = {};
      if (d.fadeInMs) Object.assign(transition, { inType: "Fade", inDurationMs: Math.round(Math.min(d.fadeInMs, (d.endMs - d.startMs) / 2)) });
      if (d.fadeOutMs) Object.assign(transition, { outType: "Fade", outDurationMs: Math.round(Math.min(d.fadeOutMs, (d.endMs - d.startMs) / 2)) });
      const effect: Omit<SequenceEffect, "id"> = { name: d.name, startMs: d.startMs, endMs: d.endMs, params: d.params };
      if (d.palette.length) effect.palette = d.palette;
      if (d.layer) effect.layerIndex = d.layer;
      if (d.layerSettings) effect.layer = d.layerSettings;
      if (d.mix !== undefined) effect.mix = d.mix;
      if (Object.keys(transition).length) effect.transition = transition;
      return { elementType: d.unit.elementType, elementId: d.unit.elementId, ...(d.unit.subName !== undefined ? { subName: d.unit.subName } : {}), key: d.unit.prop.key, role: d.unit.prop.role, effect };
    });
}

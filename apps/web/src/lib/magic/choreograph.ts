import { EFFECT_SCHEMAS, NOTE_RANGE_VU_METER_TYPES, defaultParamsFor, type PictureImage } from "@webxlights/engine";
import { colorInputNames, defaultValueFor } from "@webxlights/formats";
import type { EffectParamValue, RowElementType, SequenceEffect, ShaderRecord } from "../api";
import type { PropInfo, Role, Tier } from "../propRoles";
import { PARAMS, importEffectSettings } from "../xsqEffectSettings";
import { keyedRandom, nativeEffectName, weightedOrder } from "./director";
import type { FeelSpec } from "./feels";
import { drawMotif, songMotifs } from "./motifs";
import type { SectionPlan, ShowPlan } from "./plan";
import { priors } from "./priors";
import { ROLE_EFFECTS, TWO_D_ONLY } from "./roleEffects";
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
  /** Library shaders it may place on the 2D heroes and the whole house: the built-ins. */
  shaders?: readonly MagicShader[];
}

export type MagicShader = Pick<ShaderRecord, "id" | "name" | "source" | "inputs">;

/** Effects that mark a beat: re-triggered at the beat grid, each filling to the next. */
export const PUNCTUAL = new Set(["On", "Shockwave", "Ripple", "Curtain", "SingleStrand", "Color Wash", "Strobe", "Fan", "Bars", "Morph", "Marquee", "Lightning", "Shape", "Circles", "Fill"]);
const TIER_PRIORITY: Record<Tier, number> = { fill: 0, frame: 1, feature: 2, hero: 3 };
/** The corpus: about 30-36% of a song's props are lit at any second; quietest 16 s ~24%, busiest ~52%. */
const LIT_SHARE_QUIET = priors.structure.litShareQuietPhrase.p50;
const LIT_SHARE_BUSY = priors.structure.litShareBusyPhrase.p50;
/** Pictures carry their pixels in the sequence body, about 10 KB each, inside the autosave budget. */
const MAX_PICTURES = 8;

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
 * sub-model that is a prop of its own carries its own role; a part is left to its parent.
 */
function unitsByRole(props: readonly PropInfo[]): Map<Role, Unit[]> {
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
    const own = groups
      .filter((g) => g.role === role && g.members!.filter((k) => byKey.get(k)?.role === role).length >= 0.75 * g.members!.length)
      .sort((a, b) => b.members!.length - a.members!.length || a.key.localeCompare(b.key))[0];
    const covered = new Set(own?.members ?? []);
    const carriers = [...(own ? [own] : []), ...models.filter((m) => m.role === role && !covered.has(m.key))].sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
    out.set(role, carriers.map(unit));
  }
  const house = groups.filter((g) => g.role === "whole_house").sort((a, b) => b.members!.length - a.members!.length)[0];
  if (house) out.set("whole_house", [unit(house, 0)]);
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
  const units = unitsByRole(props);
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
  const usable = (options.shaders ?? []).filter((sh) => colorInputNames(sh.inputs ?? []).length > 0);
  const named = (names: readonly string[]) => names.map((n) => usable.find((sh) => sh.name === n)).filter((sh): sh is MagicShader => !!sh);
  const shaderLists = { calm: named(feel.shaders.calm), lively: named(feel.shaders.lively) };
  for (const key of ["calm", "lively"] as const) if (!shaderLists[key].length) shaderLists[key] = usable;
  const motifs = songMotifs(options.title, feel.motifs);
  const images = new Map<string, PictureImage>();
  let picturesLeft = MAX_PICTURES;
  // The order roles come in for a look, kept so a repeat of the look lights the same roles.
  const lookRoles = new Map<string, Role[]>();
  const litLooks = new Map<Role, number>();
  const countedLooks = new Set<string>();
  const tierOf = (role: Role) => units.get(role)![0]!.prop.tier;
  const totalRows = allUnits.length;

  song.sections.forEach((section, si) => {
    const sp = planOf(si);
    const palette = plan.palettes[sp.palette] ?? Object.values(plan.palettes)[0] ?? ["#ffffff", "#ff0000"];
    const { pairs, accent } = colourPlan(palette, [...units.keys()], tierOf, sp.intensity);
    const lookNo = lookNumbers.get(sp.look) ?? 0;
    const firstBeat = beatAtOrAfter(song.beats, section.startMs);
    const endBeat = si === song.sections.length - 1 ? song.beats.length : beatAtOrAfter(song.beats, section.endMs);
    if (endBeat <= firstBeat) return;

    // 1. Lit or dark. Heroes carry the song; every other role comes in to mark sections, more of
    // them the louder the section, up to the corpus's busy-phrase share of the house.
    const roles = [...units.keys()];
    let order = lookRoles.get(sp.look);
    if (!order) {
      // Roles that have sat out the looks so far move up, so every role gets its sections.
      order = weightedOrder(roles.filter((r) => tierOf(r) !== "hero" && r !== "whole_house"), (r) => (priors.roles[r]?.coverage.p50 ?? 0.1) * (litLooks.get(r) ? 1 / (1 + 2 * litLooks.get(r)!) : 6), seed, `lit:${sp.look}`);
      lookRoles.set(sp.look, order);
    }
    // From under the corpus's quietest-phrase median to its busiest: a lit role covers its whole
    // section here, where the corpus's flicker on and off inside one, so the same share of rows
    // gives more light.
    const target = (LIT_SHARE_QUIET * 0.6 + (LIT_SHARE_BUSY - LIT_SHARE_QUIET * 0.6) * sp.intensity) * totalRows;
    const lit = new Set<Role>(roles.filter((r) => (tierOf(r) === "hero" && sp.intensity >= 0.2) || sp.featured.includes(r)));
    let litRows = [...lit].reduce((n, r) => n + units.get(r)!.length, 0);
    for (const role of order) {
      if (litRows >= target) break;
      if (lit.has(role)) continue;
      lit.add(role);
      litRows += units.get(role)!.length;
    }
    if (!countedLooks.has(sp.look)) {
      countedLooks.add(sp.look);
      for (const role of lit) litLooks.set(role, (litLooks.get(role) ?? 0) + 1);
    }
    // A whole-house texture sits under everything, so it only plays when the house is busy.
    if (units.has("whole_house") && sp.intensity >= 0.6 && keyedRandom(seed, `house:${sp.look}`) < 0.5) lit.add("whole_house");
    // A dark flood under a lit whole-house group would show the group: floods hold an Off backdrop
    // instead (18% of flood time in the corpus is Off).
    if (lit.has("whole_house") && units.has("flood") && !lit.has("flood")) {
      for (const unit of units.get("flood")!) {
        drafts.push({ unit, layer: 0, startMs: section.startMs, endMs: section.endMs, name: "Off", params: { ...defaultParamsFor("Off") }, palette: [] });
      }
    }

    // 2-4. Per phrase (4 bars), one family per role, re-triggered on the grid, coordinated.
    const barStarts = song.downbeats.filter((d) => d >= section.startMs - 1 && d < section.endMs - 1);
    const phraseBeats: number[] = [firstBeat];
    for (let i = 4; i < barStarts.length; i += 4) if (barStarts.length - i >= 2) phraseBeats.push(beatAtOrAfter(song.beats, barStarts[i]!));
    phraseBeats.push(endBeat);

    for (const role of lit) {
      const roleUnits = units.get(role)!;
      const families = (sp.families[role] ?? ROLE_EFFECTS[role].slice(0, 3)).filter((n) => ROLE_EFFECTS[role].includes(n));
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
          const canShader = usable.length > 0 && unit.prop.dims === 2 && (role === "whole_house" || (unit.prop.tier === "hero" && role !== "singing_face"));
          const canPicture = motifs.length > 0 && role === "matrix" && unit.prop.dims === 2 && unit.prop.nodes >= 200;
          const kinds = role === "whole_house" ? ["shader"] : [...(canPicture ? ["picture"] : []), "family", ...(canShader ? ["shader"] : [])];
          let kind = kinds[(p + lookNo) % kinds.length]!;
          if ((kind === "shader" && !canShader) || (kind === "picture" && picturesLeft <= 0)) kind = "family";
          if (kind === "shader") {
            const list = sp.intensity < 0.5 ? shaderLists.calm : shaderLists.lively;
            const shader = list[(lookNo * 3 + (role === "matrix" ? 1 : role === "whole_house" ? 2 : 0)) % list.length]!;
            const inputs = shader.inputs ?? [];
            // As EffectPropsPanel stores a picked shader: inputs and colour names ride as params.
            const params: SequenceEffect["params"] = {
              ...defaultParamsFor("Shader"), source: shader.source, speed: clampTo("Shader", "speed", (feel.speed * song.bpm) / 120), shaderId: shader.id,
              inputs: Object.fromEntries(inputs.map((i) => [i.name, defaultValueFor(i)])) as unknown as EffectParamValue,
              colorInputs: colorInputNames(inputs) as unknown as EffectParamValue,
            };
            drafts.push({ unit, layer: 0, startMs: beatTime(from), endMs: beatTime(to), name: "Shader", params, palette: [...pair, accent] });
            return;
          }
          if (kind === "picture") {
            const motif = motifs[lookNo % motifs.length]!;
            const colours = [...pair, accent];
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
          const name = unit.prop.dims === 1 && TWO_D_ONLY.has(chosen) ? families.find((f) => !TWO_D_ONLY.has(f)) : chosen;
          if (!name) return;
          const punctual = PUNCTUAL.has(name);
          // Punctual effects trigger a beat apart when the section is loud, a bar or two apart when
          // it is quiet. Textures run their corpus length back to back.
          let interval = punctual ? punctualInterval(sp.intensity, unit.prop.tier, sp.featured.includes(role), song.bpm) : textureBeats(name);
          interval = Math.max(step, Math.ceil(interval / step) * step);
          // Motion: a sweep across the role's props, one prop per beat.
          const n = roleUnits.length;
          const position = sp.motion === "right-to-left" ? n - 1 - k : sp.motion === "centre-out" ? Math.round(Math.abs(unit.prop.x - 0.5) * 2 * (n - 1)) : k;
          let phase = 0;
          if (n > 1 && sp.motion !== "unison") {
            if (punctual) {
              const cycle = sp.motion === "alternate" ? 2 : Math.min(n, song.beatsPerBar);
              interval = Math.max(interval, cycle * step);
              phase = sp.motion === "alternate" ? (k % 2) * step : (position % cycle) * step;
            } else phase = Math.min(position, song.beatsPerBar - 1) * step;
          }
          let variation = 0;
          for (let b = from + phase; b < to; b += interval) {
            // A punctual effect on a prop that comes and goes lasts at most two beats (a bar on the
            // slow songs' bar grid) and leaves the
            // rest of its slot dark, the way the corpus's one-beat effects do; that gap is what
            // makes the next trigger read as a beat. Heroes, lit all song, fill their slot.
            const end = Math.min(b + (punctual && unit.prop.tier !== "hero" ? Math.min(interval, step === 1 ? 2 : step) : interval), to);
            const startMs = beatTime(b), endMs = beatTime(end);
            if (endMs <= startMs) continue;
            const { params, layer } = effectParams(name, end - b, variation + (sp.motion === "right-to-left" ? 1 : 0), feel, options.title);
            const size = Math.max(1, Math.min(2, priors.palette.sizeByEffect[nativeEffectName(name)] ?? 1));
            // A re-triggered effect swaps the pair on each trigger, so the beat shows as a
            // two-colour pattern; a texture holds it.
            const colors = [...new Set((punctual && variation % 2 ? [pair[1]!, pair[0]!] : pair).slice(0, size))];
            // A pulse that comes and goes dies away in the quieter sections, and breathes in as
            // well in the quietest; the loud ones cut.
            const pulse = punctual && unit.prop.tier !== "hero" && sp.intensity < 0.5 ? { fadeOutMs: (endMs - startMs) / 2, ...(sp.intensity < 0.35 ? { fadeInMs: (endMs - startMs) / 3 } : {}) } : {};
            drafts.push({ unit, layer: 0, startMs, endMs, name, params, palette: colors, ...(layer ? { layerSettings: layer } : {}), ...pulse });
            variation++;
          }
        });
      }
    }

    // 7. Heroes take a third layer in the loud sections: a texture at low mix over their base
    // (the corpus's mega trees and matrices run 2 layers at the median, 6-7 at p90).
    if (sp.intensity >= 0.75) {
      for (const unit of [...lit].flatMap((r) => units.get(r)!).filter((u) => u.prop.tier === "hero" && u.prop.dims === 2)) {
        const name = ["Twinkle", "Shimmer"].find((n) => ROLE_EFFECTS[unit.prop.role].includes(n));
        if (!name) continue;
        for (let p = 0; p + 1 < phraseBeats.length; p++) {
          const [from, to] = [phraseBeats[p]!, phraseBeats[p + 1]!];
          const { params } = effectParams(name, to - from, p, feel, options.title);
          drafts.push({ unit, layer: 2, startMs: beatTime(from), endMs: beatTime(to), name, params, palette: [accent], mix: 0.6 });
        }
      }
    }

    // 5. Accents on a second layer: short pulses on the heroes and the frame of the house.
    if (sp.accents !== "none") {
      let times: number[] = [];
      if (sp.accents === "beats" && step === 1) times = song.beats.slice(firstBeat, endBeat);
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
      // The heroes take the downbeats; beat
      // and hit accents go to the frame of the house when it is carrying the section.
      const bars = barStarts;
      const accentUnits = [...lit].flatMap((r) => units.get(r)!).filter((u) => (u.prop.tier === "hero" && u.prop.dims === 2 && u.prop.role !== "singing_face") || (u.prop.tier === "frame" && sp.featured.includes(u.prop.role) && sp.accents !== "downbeats"));
      for (const unit of accentUnits) {
        const own = unit.prop.tier === "hero" ? bars : times;
        const allowed = ROLE_EFFECTS[unit.prop.role];
        const name = unit.prop.dims === 2 && allowed.includes("Shockwave") ? "Shockwave" : allowed.includes("On") ? "On" : undefined;
        if (!name) continue;
        own.forEach((t, i) => {
          const next = own[i + 1] ?? section.endMs;
          const endMs = Math.min(t + beatMs, next, section.endMs);
          if (endMs - t < frameMs) return;
          const { params } = effectParams(name, 1, i, feel, options.title);
          // Accents all wear the accent colour; an On accent decays unless the section is loud.
          drafts.push({ unit, layer: 1, startMs: t, endMs, name, params, palette: [accent], ...(name === "On" && sp.intensity < 0.75 ? { fadeOutMs: (endMs - t) / 2 } : {}) });
        });
      }
    }

    litBySection[si] = new Set([...lit].flatMap((r) => units.get(r)!));
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

  // Whole-house hits: where the plan asks and where the song jumps on a downbeat, rationed to the
  // corpus's p75 of about 1.5 a minute. Every prop takes it, on the accent layer.
  const allowedHits = Math.max(1, Math.floor((priors.structure.bigHitsPerMinute.p75 * song.durationMs) / 60000));
  const candidates: number[] = [];
  for (const sp of plan.sections) if (sp.wholeHouseHit && song.sections[sp.index]) candidates.push(song.sections[sp.index]!.startMs);
  for (const ms of song.impacts) {
    const b = beatAtOrAfter(song.downbeats, ms - beatMs / 4);
    const db = song.downbeats[b];
    const rising = (song.energy[beatAtOrAfter(song.beats, ms + beatMs)] ?? 0) > (song.energy[Math.max(0, beatAtOrAfter(song.beats, ms - 2 * beatMs))] ?? 0) + 0.15;
    if (db !== undefined && Math.abs(db - ms) <= beatMs / 4 && rising) candidates.push(db);
  }
  const hits: number[] = [];
  for (const t of candidates) {
    if (hits.length >= allowedHits) break;
    if (t <= 0 || t >= song.durationMs - beatMs || hits.some((h) => Math.abs(h - t) < 16 * beatMs)) continue;
    hits.push(t);
  }
  if (plan.ending === "hit-then-dark") {
    const lastBar = [...song.downbeats].reverse().find((d) => d <= song.durationMs - 2 * beatMs);
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
    const hitColour = sectionPalette[sectionPalette.length - 1] ?? "#ffffff";
    for (const unit of allUnits) {
      if (unit.prop.role === "whole_house") continue;
      for (const d of drafts) if (d.unit === unit && d.layer === 1 && d.endMs > t && d.startMs < t + length) d.endMs = d.startMs; // the hit replaces accents
      const allowed = ROLE_EFFECTS[unit.prop.role];
      const name = unit.prop.tier === "hero" && unit.prop.dims === 2 && allowed.includes("Shockwave") ? "Shockwave" : "On";
      const { params } = effectParams(name, 1, 0, feel, options.title);
      drafts.push({ unit, layer: 1, startMs: t, endMs: Math.min(t + length, song.durationMs), name, params, palette: [hitColour], hit: true, ...(last ? { fadeOutMs: 1.5 * beatMs } : {}) });
    }
  }

  if (plan.ending === "fade") {
    const tail = song.sections[song.sections.length - 1];
    for (const d of drafts) if (tail && d.layer === 0 && d.endMs >= song.durationMs - 2 * beatMs && d.startMs >= tail.startMs) d.fadeOutMs = Math.min(4 * beatMs, (d.endMs - d.startMs) * 0.75);
  } else if (plan.ending === "hold") {
    const lastByUnit = new Map<Unit, Draft>();
    for (const d of drafts) if (d.layer === 0) lastByUnit.set(d.unit, d);
    for (const d of lastByUnit.values()) if (d.endMs >= song.durationMs - 4 * beatMs) d.endMs = song.durationMs;
  }
  // A picture plays alone: no accents or texture over it, short of a whole-house hit.
  const pictures = drafts.filter((d) => d.name === "Pictures");
  const shown = drafts.filter((d) => d.layer === 0 || d.hit || !pictures.some((p) => p.unit === d.unit && p.startMs < d.endMs && d.startMs < p.endMs));

  return finish(shown, song, frameMs, seed, totalRows);
}

/** Frame-snap, keep layers non-overlapping, and thin moments where too much of the house starts at once. */
function finish(drafts: Draft[], song: SongMap, frameMs: number, seed: number, totalRows: number): Placement[] {
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
  // the effect before them (the same effect held across the beat) until the moment is below it.
  const rowsInUse = new Set(live.map((d) => d.unit.prop.key)).size || totalRows;
  const cap = Math.max(4, Math.ceil(0.4 * rowsInUse)) - 1;
  const buckets = new Map<number, Draft[]>();
  for (const d of live) if (!d.hit) (buckets.get(d.startMs) ?? buckets.set(d.startMs, []).get(d.startMs)!).push(d);
  const removed = new Set<Draft>();
  for (const [ms, list] of buckets) {
    const rows = new Map<string, Draft[]>();
    for (const d of list) (rows.get(d.unit.prop.key) ?? rows.set(d.unit.prop.key, []).get(d.unit.prop.key)!).push(d);
    if (rows.size <= cap) continue;
    const victims = [...rows.keys()].sort((a, b) => TIER_PRIORITY[rows.get(a)![0]!.unit.prop.tier] - TIER_PRIORITY[rows.get(b)![0]!.unit.prop.tier] || keyedRandom(seed, `thin:${ms}:${a}`) - keyedRandom(seed, `thin:${ms}:${b}`));
    for (const key of victims.slice(0, rows.size - cap)) {
      for (const d of rows.get(key)!) {
        const prev = live.find((x) => !removed.has(x) && lane(x) === lane(d) && x.endMs === d.startMs && x.name === d.name);
        if (prev) prev.endMs = d.endMs;
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

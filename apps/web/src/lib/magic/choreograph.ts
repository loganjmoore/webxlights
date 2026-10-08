import { EFFECT_SCHEMAS, NOTE_RANGE_VU_METER_TYPES, defaultParamsFor } from "@webxlights/engine";
import type { RowElementType, SequenceEffect } from "../api";
import type { PropInfo, Role, Tier } from "../propRoles";
import { PARAMS, importEffectSettings } from "../xsqEffectSettings";
import { keyedRandom, nativeEffectName, weightedOrder } from "./director";
import type { FeelSpec } from "./feels";
import type { SectionPlan, ShowPlan } from "./plan";
import { priors } from "./priors";
import { ROLE_EFFECTS, TWO_D_ONLY } from "./roleEffects";
import type { SongMap } from "@webxlights/engine";

// The choreographer: (SongMap, PropMap, ShowPlan, priors) -> effects (docs/MAGIC-SEQUENCE.md
// 2.4). Pure and seeded, so a generated sequence can be reproduced, tested and regenerated.

export interface Placement {
  elementType: Extract<RowElementType, "model" | "group">;
  elementId: number;
  /** The prop this lands on, "model:12" or "group:3". */
  key: string;
  role: Role;
  effect: Omit<SequenceEffect, "id">;
}

export interface ChoreographOptions {
  feel: FeelSpec;
  /** Overrides plan.seed: "Try another" re-rolls the choices, not the plan. */
  seed?: number;
  frameMs: number;
  /** For Text on a matrix. */
  title?: string;
}

/** Effects that mark a beat: re-triggered at the beat grid, each filling to the next. */
const PUNCTUAL = new Set(["On", "Shockwave", "Ripple", "Curtain", "SingleStrand", "Color Wash", "Strobe", "Fan", "Bars", "Morph", "Marquee", "Lightning", "Shape", "Circles", "Fill"]);
const TIER_PRIORITY: Record<Tier, number> = { fill: 0, frame: 1, feature: 2, hero: 3 };
/** The corpus: about 30-36% of a song's props are lit at any second; quietest 16 s ~24%, busiest ~52%. */
const LIT_SHARE_QUIET = priors.structure.litShareQuietPhrase.p50;
const LIT_SHARE_BUSY = priors.structure.litShareBusyPhrase.p50;

interface Unit { prop: PropInfo; elementType: "model" | "group"; elementId: number; order: number }
interface Draft { unit: Unit; layer: number; startMs: number; endMs: number; name: string; params: SequenceEffect["params"]; palette: string[]; layerSettings?: SequenceEffect["layer"]; fadeInMs?: number; fadeOutMs?: number; hit?: boolean }

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

/** Who carries each role: the user's role group if it covers the role, else each model. */
function unitsByRole(props: readonly PropInfo[]): Map<Role, Unit[]> {
  const models = props.filter((p) => p.key.startsWith("model:") && p.nodes > 0);
  const groups = props.filter((p) => p.key.startsWith("group:") && (p.members?.length ?? 0) >= 2);
  const byKey = new Map(props.map((p) => [p.key, p]));
  const out = new Map<Role, Unit[]>();
  const unit = (prop: PropInfo, order: number): Unit => ({ prop, elementType: prop.key.startsWith("group:") ? "group" : "model", elementId: Number(prop.key.split(":")[1]), order });
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
  const litBefore = new Set<Unit>();
  // The order roles come in for a look, kept so a repeat of the look lights the same roles.
  const lookRoles = new Map<string, Role[]>();
  const litLooks = new Map<Role, number>();
  const countedLooks = new Set<string>();
  const tierOf = (role: Role) => units.get(role)![0]!.prop.tier;
  const totalRows = allUnits.length;

  song.sections.forEach((section, si) => {
    const sp: SectionPlan = plan.sections.find((s) => s.index === si) ?? plan.sections[Math.min(si, plan.sections.length - 1)]!;
    const palette = plan.palettes[sp.palette] ?? Object.values(plan.palettes)[0] ?? ["#ffffff", "#ff0000"];
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
          const name = unit.prop.dims === 1 && TWO_D_ONLY.has(chosen) ? families.find((f) => !TWO_D_ONLY.has(f)) : chosen;
          if (!name) return;
          const punctual = PUNCTUAL.has(name);
          // Punctual effects fill to the next trigger: a beat apart when the section is loud, a
          // bar apart when it is quiet. Textures run their corpus length back to back.
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
            const end = punctual ? Math.min(b + interval, to) : Math.min(b + interval, to);
            const startMs = beatTime(b), endMs = beatTime(end);
            if (endMs <= startMs) continue;
            const { params, layer } = effectParams(name, end - b, variation + (sp.motion === "right-to-left" ? 1 : 0), feel, options.title);
            const size = Math.max(1, Math.min(2, priors.palette.sizeByEffect[nativeEffectName(name)] ?? 1));
            const colors = Array.from({ length: Math.min(size, palette.length) }, (_, c) => palette[(variation + c + k) % palette.length]!);
            drafts.push({ unit, layer: 0, startMs, endMs, name, params, palette: colors, ...(layer ? { layerSettings: layer } : {}) });
            variation++;
          }
        });
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
      // The heroes take the downbeats (every bar when it is loud, every other bar otherwise); beat
      // and hit accents go to the frame of the house when it is carrying the section.
      const bars = sp.intensity >= 0.7 ? barStarts : barStarts.filter((_, i) => i % 2 === 0);
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
          drafts.push({ unit, layer: 1, startMs: t, endMs, name, params, palette: [palette[(i + 1) % palette.length]!] });
        });
      }
    }

    // Fades in where a prop comes in from dark, for textures; punctual effects already pulse.
    for (const unit of [...lit].flatMap((r) => units.get(r)!)) {
      const first = drafts.find((d) => d.unit === unit && d.layer === 0 && d.startMs >= section.startMs - 1);
      if (first && !litBefore.has(unit) && !PUNCTUAL.has(first.name)) first.fadeInMs = Math.min(beatMs * step, (first.endMs - first.startMs) / 2);
    }
    litBefore.clear();
    for (const role of lit) for (const unit of units.get(role)!) litBefore.add(unit);
  });

  // Section ends: textures fade out into the next section's look.
  for (const section of song.sections) {
    const lastByUnit = new Map<Unit, Draft>();
    for (const d of drafts) if (d.layer === 0 && d.startMs >= section.startMs - 1 && d.startMs < section.endMs - 1) lastByUnit.set(d.unit, d);
    for (const d of lastByUnit.values()) if (!PUNCTUAL.has(d.name)) d.fadeOutMs = Math.min(beatMs, (d.endMs - d.startMs) / 2);
  }

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
  const lastPalette = plan.palettes[plan.sections[plan.sections.length - 1]?.palette ?? ""] ?? ["#ffffff"];
  for (const t of hits) {
    const length = t === hits[hits.length - 1] && plan.ending === "hit-then-dark" ? 2 * beatMs : beatMs;
    for (const unit of allUnits) {
      if (unit.prop.role === "whole_house") continue;
      for (const d of drafts) if (d.unit === unit && d.layer === 1 && d.endMs > t && d.startMs < t + length) d.endMs = d.startMs; // the hit replaces accents
      const allowed = ROLE_EFFECTS[unit.prop.role];
      const name = unit.prop.tier === "hero" && unit.prop.dims === 2 && allowed.includes("Shockwave") ? "Shockwave" : "On";
      const { params } = effectParams(name, 1, 0, feel, options.title);
      drafts.push({ unit, layer: 1, startMs: t, endMs: Math.min(t + length, song.durationMs), name, params, palette: [lastPalette[0] ?? "#ffffff"], hit: true });
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
  // Intro builds in.
  for (const d of drafts) if (d.layer === 0 && d.startMs < (song.sections[0]?.endMs ?? 0) && d.startMs === drafts.find((x) => x.unit === d.unit && x.layer === 0)?.startMs && !d.fadeInMs) d.fadeInMs = Math.min(2 * beatMs, (d.endMs - d.startMs) / 2);

  return finish(drafts, song, frameMs, seed, totalRows);
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
      const effect: Omit<SequenceEffect, "id"> = { name: d.name, startMs: d.startMs, endMs: d.endMs, params: d.params, palette: d.palette };
      if (d.layer) effect.layerIndex = d.layer;
      if (d.layerSettings) effect.layer = d.layerSettings;
      if (Object.keys(transition).length) effect.transition = transition;
      return { elementType: d.unit.elementType, elementId: d.unit.elementId, key: d.unit.prop.key, role: d.unit.prop.role, effect };
    });
}

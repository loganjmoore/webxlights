import { beatIndexAt, type AudioSeries, type RGBA, type SongMap } from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "../api";
import { createHouseRenderer } from "../fseqExport";
import type { Placement } from "./choreograph";
import { nativeEffectName } from "./director";
import { priors } from "./priors";

// How well a generated sequence follows the music, measured from the rendered house the way a
// viewer would see it (docs/MAGIC-SEQUENCE.md 2.6). Adapted from LightsAutoSequencer's js/fit.js
// (computergeek1507, GPL-3.0, https://github.com/computergeek1507/LightsAutoSequencer): loud, beat
// and lift as there, rendered through this app's own renderer, plus style and variety.
//
//   loud    - does the house get brighter when the song gets louder? (r >= 0.6 scores 1)
//   beat    - do the lights change more just after a beat than mid-beat? (ratio >= 2.5 scores 1)
//   lift    - are the loud sections brighter than the quiet ones? (r >= 0.7 scores 1)
//   style   - is the effect-by-role mix as close to the corpus's as a real song's? (corpus IQR)
//   variety - a look per kind of section, and no two neighbours alike

export interface FitScore {
  /** 0..100. */
  score: number;
  loud: number;
  beat: number;
  lift: number;
  style: number;
  variety: number;
  raw: { rLoud: number; beatRatio: number; rLift: number; jsd: number; looks: number; groups: number; sameNeighbours: number };
}

/** Below these a sequence has a real problem, whatever its total. */
export const SCORE_FLOORS = { loud: 0.4, beat: 0.4, lift: 0.5, style: 0.3, variety: 0.5 } as const;
const WEIGHTS = { loud: 0.3, beat: 0.3, lift: 0.2, style: 0.1, variety: 0.1 } as const;
const STEP_MS = 250;
const STRIDE = 8;

/** Effects Magic Sequence never places, left out of the style comparison as analyze.mjs does. */
const NEVER_PLACED = new Set(["Faces", "Pictures", "Video", "Shader", "State", "DMX", "Moving Head", "Sketch", "Kaleidoscope", "Warp", "Piano", "Guitar", "Liquid", "Off"]);

function corr(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]!; mb += b[i]!; }
  ma /= n;
  mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma, y = b[i]! - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Jensen-Shannon divergence, base 2, of two unnormalised distributions. */
export function jsd(p: Record<string, number>, q: Record<string, number>): number {
  const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0) || 1;
  const sp = sum(p), sq = sum(q);
  let s = 0;
  for (const k of new Set([...Object.keys(p), ...Object.keys(q)])) {
    const a = (p[k] ?? 0) / sp, b = (q[k] ?? 0) / sq, m = (a + b) / 2;
    if (a > 0) s += 0.5 * a * Math.log2(a / m);
    if (b > 0) s += 0.5 * b * Math.log2(b / m);
  }
  return s;
}

/** Seconds-weighted JSD of a sequence's effect-by-role mix from the corpus's, as analyze.mjs measures a song. */
export function styleDivergence(placements: readonly Placement[]): number {
  const seconds: Record<string, Record<string, number>> = {};
  for (const p of placements) {
    const role = (seconds[p.role] ??= {});
    const name = nativeEffectName(p.effect.name);
    role[name] = (role[name] ?? 0) + (p.effect.endMs - p.effect.startMs) / 1000;
  }
  let weighted = 0, weight = 0;
  for (const [role, mine] of Object.entries(seconds)) {
    const full = priors.roles[role]?.effectShareBySeconds;
    if (!full) continue;
    const prior = Object.fromEntries(Object.entries(full).filter(([k]) => !NEVER_PLACED.has(k)));
    const top = Object.fromEntries(Object.entries(mine).filter(([k]) => k in prior));
    const total = Object.values(top).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    weighted += jsd(top, prior) * total;
    weight += total;
  }
  return weight ? weighted / weight : 0;
}

/** Each section's look: the role and effect pairs on the base layer, and the colours used. */
export function sectionLooks(song: SongMap, placements: readonly Placement[]): string[] {
  return song.sections.map((s) => {
    const inside = placements.filter((p) => !p.effect.layerIndex && p.effect.startMs >= s.startMs && p.effect.startMs < s.endMs);
    const pairs = [...new Set(inside.map((p) => `${p.role}:${p.effect.name}`))].sort();
    const colours = [...new Set(inside.flatMap((p) => (p.effect.palette ?? []).filter((c): c is string => typeof c === "string")))].sort();
    return JSON.stringify([pairs, colours]);
  });
}

export interface ScoreInput {
  song: SongMap;
  models: ModelRecord[];
  groups: ModelGroupRecord[];
  /** The sequence with the generated effects in it: what gets rendered. */
  body: SequenceBody;
  /** The generated effects alone, with their roles: what style and variety read. */
  placements: readonly Placement[];
  frameMs: number;
  audio?: AudioSeries;
  blendBetweenModels?: boolean;
}

export function fitScore(input: ScoreInput): FitScore {
  const { song, models, groups, body, placements, frameMs, audio } = input;
  const level = (colors: Array<RGBA[] | null>) => colors.map((nodes) => {
    if (!nodes || nodes.length === 0) return 0;
    let s = 0, n = 0;
    for (let i = 0; i < nodes.length; i += STRIDE) {
      const c = nodes[i]!;
      s += c.a > 0 ? (c.r + c.g + c.b) / 765 : 0;
      n++;
    }
    return s / n;
  });
  // Each prop counts once, however many lights it has: the matrix is one prop, not a third of the show.
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // Brightness through the song against loudness.
  const pass = createHouseRenderer(models, body, frameMs, audio, groups, input.blendBetweenModels);
  const bright: number[] = [], loud: number[] = [], times: number[] = [];
  for (let t = STEP_MS / 2; t < song.durationMs; t += STEP_MS) {
    bright.push(mean(level(pass.renderAt(t))));
    loud.push(song.energy[Math.max(0, beatIndexAt(song, t))] ?? 0);
    times.push(t);
  }
  // Smoothed over a second, so single flashes don't swamp the trend.
  const smooth = bright.map((_, i) => mean(bright.slice(Math.max(0, i - 2), i + 3)));
  const rLoud = corr(smooth, loud);

  // Change just after a beat against the same gap in the middle of the beat.
  const probes = createHouseRenderer(models, body, frameMs, audio, groups, input.blendBetweenModels);
  const beatMs = 60000 / song.bpm;
  const diff = (a: number[], b: number[]) => mean(a.map((v, i) => Math.abs(v - b[i]!)));
  let on = 0, off = 0;
  for (let i = 0; i < song.beats.length; i += 2) {
    const b = song.beats[i]!;
    if (b < 40 || b + beatMs * 0.45 + 120 >= song.durationMs) continue;
    const before = level(probes.renderAt(b - 40));
    on += diff(before, level(probes.renderAt(b + 80)));
    const mid = level(probes.renderAt(b + beatMs * 0.45));
    off += diff(mid, level(probes.renderAt(b + beatMs * 0.45 + 120)));
  }
  const beatRatio = off > 0 ? on / off : on > 0 ? 3 : 1;

  // Sections: brightness against their energy.
  const sectionBright = song.sections.map((s) => mean(bright.filter((_, i) => times[i]! >= s.startMs && times[i]! < s.endMs)));
  const rLift = corr(sectionBright, song.sections.map((s) => s.energy));

  const spread = priors.style.roleEffectJsd.perSong;
  const divergence = styleDivergence(placements);
  const looks = sectionLooks(song, placements);
  const groupsCount = new Set(song.sections.map((s) => s.group)).size;
  const sameNeighbours = looks.filter((l, i) => i > 0 && l === looks[i - 1]).length;
  const parts = {
    loud: clamp01(rLoud / 0.6),
    beat: clamp01((beatRatio - 1) / 1.5),
    lift: song.sections.length < 3 ? 1 : clamp01(rLift / 0.7),
    style: clamp01((spread.p75 - divergence) / (spread.p75 - spread.p25)),
    variety: clamp01(new Set(looks).size / Math.max(1, groupsCount)) * (1 - sameNeighbours / Math.max(1, looks.length - 1)),
  };
  const score = Math.round(100 * Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k as keyof typeof parts], 0));
  return { score, ...parts, raw: { rLoud, beatRatio, rLift, jsd: divergence, looks: new Set(looks).size, groups: groupsCount, sameNeighbours } };
}

/** Whether every part of a score clears its floor. */
export function clearsFloors(score: FitScore): boolean {
  return (Object.keys(SCORE_FLOORS) as (keyof typeof SCORE_FLOORS)[]).every((k) => score[k] >= SCORE_FLOORS[k]);
}

/** The best of several candidates: the highest score among those that clear every floor, else the highest. */
export function bestCandidate<T>(candidates: readonly T[], fit: (candidate: T) => FitScore): T {
  const passing = candidates.filter((c) => clearsFloors(fit(c)));
  return (passing.length ? passing : candidates).reduce((a, b) => (fit(b).score > fit(a).score ? b : a));
}

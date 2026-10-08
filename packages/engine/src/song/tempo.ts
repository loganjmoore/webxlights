// Ported from LightsAutoSequencer js/analysis.js (computergeek1507, GPL-3.0,
// https://github.com/computergeek1507/LightsAutoSequencer, commit b55d5b3f1e5162b41aa01aa29530e7d7fb4dceef).
//
// Changed from the original: typed, and split out of the closure into plain functions. The
// algorithm is the original's: an autocorrelation for a rough tempo, a circular-concentration fit
// of the onsets against a grid for the fine tempo and phase, a kick-gap test for half and double
// time, and a snap to a whole BPM when that fits as well. Three things differ, each found by a
// synthetic track the original's order of steps got wrong: the autocorrelation also uses the
// kick-band envelope, the grid is fitted to the kicks from the start (not only polished against
// them at the end), and the octave is decided from the rough tempo before any grid is fitted.
// `detectTempo` also reports the fit quality (R) and returns a plain fallback instead of garbage
// when there are too few onsets.

import { FPS, type Onset } from "./features";

export interface TempoOnsets {
  envelope: Float32Array;
  kickEnvelope: Float32Array;
  all: Onset[];
  kick: Onset[];
}

export interface TempoResult {
  bpm: number;
  /** Seconds: where a beat falls, modulo the beat period. */
  offset: number;
  /** Circular concentration of the anchor onsets on the grid, 0..1. */
  R: number;
  /** The onsets the grid was fitted to, which confidence is later judged against. */
  anchor: Onset[];
  /** False when there was too little to fit and the result is the fallback. */
  found: boolean;
}

/** Autocorrelation of `env` for lags minLag-1 .. maxLag+1, scaled so lag 0 would be 1. */
function normalisedAcf(env: Float32Array, minLag: number, maxLag: number): Float64Array {
  const acf = new Float64Array(maxLag + 2);
  const n = env.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += env[i]! * env[i]!;
  if (energy <= 0) return acf;
  for (let L = minLag - 1; L <= maxLag + 1; L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += env[i]! * env[i + L]!;
    acf[L] = n > L ? (s / (n - L)) / (energy / n) : 0;
  }
  return acf;
}

/**
 * Autocorrelation of the onset envelope with a log-normal prior around 120 BPM. Only good to a
 * couple of percent; fitGrid() refines it.
 *
 * The original used the full-band envelope alone. Hi-hats on eighths put as many peaks in that
 * as the beat itself, so three eighths (100 BPM against a true 150) can score as well as the
 * beat and the prior then breaks the tie the wrong way. The kick-band envelope has nothing
 * between its beats, so adding its autocorrelation (at half weight, each scaled to its own
 * variance) lets the beat out-score the lags that only the hats reinforce.
 */
export function roughTempo(env: Float32Array, kickEnv?: Float32Array): number {
  const minLag = Math.floor((60 / 240) * FPS);
  const maxLag = Math.ceil((60 / 40) * FPS);
  const acf = normalisedAcf(env, minLag, maxLag);
  if (kickEnv) {
    const kick = normalisedAcf(kickEnv, minLag, maxLag);
    for (let L = minLag - 1; L <= maxLag + 1; L++) acf[L]! += 0.5 * kick[L]!;
  }
  let best = minLag;
  let bestScore = -Infinity;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = (60 * FPS) / L;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const score = acf[L]! * prior;
    if (score > bestScore) {
      bestScore = score;
      best = L;
    }
  }
  const a = acf[best - 1]!;
  const b = acf[best]!;
  const c = acf[best + 1]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return (60 * FPS) / (best + Math.max(-0.5, Math.min(0.5, shift)));
}

/**
 * Circular concentration of onsets on a grid of period T. Unitless, so it does not favour fast
 * tempos the way a millisecond error score does.
 */
export function phaseFit(onsets: readonly Onset[], T: number): { R: number; offset: number } {
  let c = 0;
  let s = 0;
  let w = 0;
  for (const o of onsets) {
    const ph = (2 * Math.PI * o.t) / T;
    c += o.s * Math.cos(ph);
    s += o.s * Math.sin(ph);
    w += o.s;
  }
  const R = w > 0 ? Math.hypot(c, s) / w : 0;
  let offset = (Math.atan2(s, c) / (2 * Math.PI)) * T;
  offset = ((offset % T) + T) % T;
  return { R, offset };
}

export function fitGrid(onsets: readonly Onset[], bpmLo: number, bpmHi: number, step: number) {
  let best = { bpm: bpmLo, R: -1, offset: 0 };
  for (let bpm = bpmLo; bpm <= bpmHi + 1e-9; bpm += step) {
    const r = phaseFit(onsets, 60 / bpm);
    if (r.R > best.R) best = { bpm, R: r.R, offset: r.offset };
  }
  return best;
}

export function medianOf(arr: readonly number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1]!;
}

/** Kick gaps that are a whole number of beats, bucketed by length in beats. */
function kickGapHistogram(kicks: readonly Onset[], T: number): Record<"0.5" | "1" | "2" | "4", number> {
  const h = { "0.5": 0, "1": 0, "2": 0, "4": 0 };
  const lengths: [keyof typeof h, number][] = [
    ["0.5", 0.5],
    ["1", 1],
    ["2", 2],
    ["4", 4],
  ];
  for (let i = 1; i < kicks.length; i++) {
    const g = (kicks[i]!.t - kicks[i - 1]!.t) / T;
    for (const [key, m] of lengths) if (Math.abs(g - m) < 0.1 * m) h[key]++;
  }
  return h;
}

/** Below this many onsets there is no tempo to speak of (silence, a drone, a few seconds of audio). */
const MIN_ONSETS = 8;
/** Strong kicks needed before the grid is fitted to them rather than to every onset. */
const MIN_KICKS = 24;

export function detectTempo(onsets: TempoOnsets): TempoResult {
  if (onsets.all.length < MIN_ONSETS) return { bpm: 120, offset: 0, R: 0, anchor: onsets.all, found: false };

  // The kick marks the beat. The mix's onsets wander (bass notes, vocals) and hi-hats on eighths
  // sit half a beat from it, which cancels the kicks in a phase fit: with equally strong hats the
  // true tempo scores no better than noise. The original fitted every onset first and only
  // polished against the kicks; here the kicks lead whenever there are enough of them.
  const kicks = onsets.kick.filter((k) => k.s > 0.3);
  const anchor = kicks.length >= MIN_KICKS ? kicks : onsets.all;

  let bpm = roughTempo(onsets.envelope, onsets.kickEnvelope);

  // Octave: hi-hats on eighths drag the estimate to double time, which shows up as kicks two or
  // four "beats" apart far more often than one; the reverse as kicks half a beat apart. Gap
  // evidence from a full mix is noisy, so only act on a clear majority. This is decided before
  // the grid is fitted, not after: a grid fitted at half the true tempo puts kicks one beat
  // apart on opposite sides of it, where they cancel, so that fit finds nothing and what it
  // returns is only a few percent right.
  const h = kickGapHistogram(kicks, 60 / bpm);
  const evenGaps = h["2"] + h["4"];
  if (bpm >= 110 && evenGaps >= 15 && evenGaps > 1.5 * h["1"]) bpm /= 2;
  else if (bpm < 90 && h["0.5"] >= 15 && h["0.5"] > 1.5 * h["1"]) bpm *= 2;

  const coarse = fitGrid(anchor, bpm * 0.95, bpm * 1.05, 0.05);
  bpm = fitGrid(anchor, coarse.bpm - 0.1, coarse.bpm + 0.1, 0.005).bpm;

  // Precision: polish the tempo and take the phase from the anchor alone (in half-time feels the
  // snare sits on the off-beat and averaging it in drags the grid half a beat out).
  let fine = fitGrid(anchor, bpm * 0.994, bpm * 1.006, 0.005);
  // Most produced music is at a whole (or half) BPM; prefer it if it fits as well.
  for (const cand of [Math.round(fine.bpm), Math.round(fine.bpm * 2) / 2]) {
    const r = phaseFit(anchor, 60 / cand);
    if (Math.abs(cand - fine.bpm) < 0.06 && r.R >= 0.985 * fine.R) {
      fine = { bpm: cand, ...r };
      break;
    }
  }
  return { bpm: Math.round(fine.bpm * 1000) / 1000, offset: fine.offset, R: fine.R, anchor, found: true };
}

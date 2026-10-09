// Ported from LightsAutoSequencer js/analysis.js (computergeek1507, GPL-3.0,
// https://github.com/computergeek1507/LightsAutoSequencer, commit b55d5b3f1e5162b41aa01aa29530e7d7fb4dceef).
//
// Changed from the original: the beat grid is built from the fitted tempo and nothing else (the
// original also took user overrides for BPM, offset, meter and bar shift, which a one-button
// pipeline has no use for); the meter is chosen between 3 and 4 beats per bar instead of being
// given; bars are returned only from the first downbeat on, so a partial bar at the start of the
// song never joins the similarity matrix; results are plain arrays in seconds.

import { timeFrame, type Onset, type SongFeatures, type SongModel } from "./features";

export interface Bar {
  /** Seconds. */
  s: number;
  e: number;
}

export interface Grid {
  /** Seconds, ascending. */
  beats: number[];
  /** Seconds. A subset of `beats`. */
  downbeats: number[];
  beatsPerBar: number;
  /** One full bar per downbeat; the last may be short. */
  bars: Bar[];
}

/** Strongest onset within `tol` seconds of `t`. `list` is sorted by time. */
function nearestStrength(list: readonly Onset[], t: number, tol: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.t < t - tol) lo = mid + 1;
    else if (list[mid]!.t > t + tol) hi = mid - 1;
    else {
      for (let i = mid; i >= 0 && list[i]!.t >= t - tol; i--) best = Math.max(best, list[i]!.s);
      for (let i = mid; i < list.length && list[i]!.t <= t + tol; i++) best = Math.max(best, list[i]!.s);
      break;
    }
  }
  return best;
}

export function meanVec(feat: SongFeatures, arr: Float32Array, dims: number, f0: number, f1: number): Float64Array {
  const v = new Float64Array(dims);
  const end = Math.min(f1, feat.nFrames);
  const n = Math.max(1, end - f0);
  for (let f = f0; f < end; f++) for (let d = 0; d < dims; d++) v[d]! += arr[f * dims + d]!;
  for (let d = 0; d < dims; d++) v[d]! /= n;
  return v;
}

export function unit(v: Float64Array): Float64Array {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
}

/** Mean-square level between two times, in dB (re full scale). */
export function rmsDb(feat: SongFeatures, t0: number, t1: number): number {
  const f0 = timeFrame(t0);
  const f1 = Math.min(feat.nFrames, Math.max(timeFrame(t1), f0 + 1));
  let s = 0;
  for (let f = f0; f < f1; f++) s += feat.rms[f]! * feat.rms[f]!;
  return 10 * Math.log10(s / Math.max(1, f1 - f0) + 1e-10);
}

/**
 * Evidence for which beat in `meter` is the downbeat, one value per phase: a kick that is
 * stronger there, a snare that is weaker, the harmony changing there, and big changes in the
 * mix landing there.
 */
function downbeatEvidence(model: SongModel, beats: readonly number[], meter: number) {
  const feat = model.feat;
  const kick = beats.map((t) => nearestStrength(model.onsets.kick, t, 0.05));
  const snare = beats.map((t) => nearestStrength(model.onsets.snare, t, 0.05));
  // Harmony tends to change on the bar line; compare whole bars either side.
  const chord = beats.map((t, i) => {
    if (i < meter || i + meter >= beats.length) return 0;
    const a = unit(meanVec(feat, feat.chroma, 12, timeFrame(beats[i - meter]!), timeFrame(t)));
    const b = unit(meanVec(feat, feat.chroma, 12, timeFrame(t), timeFrame(beats[i + meter]!)));
    let dot = 0;
    for (let d = 0; d < 12; d++) dot += a[d]! * b[d]!;
    return 1 - dot;
  });
  const perPhase = (arr: readonly number[]): number[] => {
    const s = new Array<number>(meter).fill(0);
    const c = new Array<number>(meter).fill(0);
    arr.forEach((v, i) => {
      s[i % meter]! += v;
      c[i % meter]!++;
    });
    const m = s.map((v, p) => v / (c[p] || 1));
    const mean = m.reduce((a, b) => a + b, 0) / meter;
    return m.map((v) => (mean > 0 ? v / mean - 1 : 0));
  };
  // Big changes in sound (a chorus landing, a drop) happen on bar lines.
  const nb = feat.nb;
  const timbre = beats.map((t, i) => {
    if (i < meter || i + meter >= beats.length) return 0;
    const a = meanVec(feat, feat.bands, nb, timeFrame(beats[i - meter]!), timeFrame(t));
    const b = meanVec(feat, feat.bands, nb, timeFrame(t), timeFrame(beats[i + meter]!));
    let d = 0;
    for (let k = 0; k < nb; k++) d += (a[k]! - b[k]!) ** 2;
    return Math.sqrt(d);
  });
  const nPeaks = Math.max(6, Math.round((model.songEnd - model.songStart) / 15));
  const peaks = timbre
    .map((_, i) => i)
    .filter((i) => i > 0 && i < timbre.length - 1 && timbre[i]! >= timbre[i - 1]! && timbre[i]! >= timbre[i + 1]!)
    .sort((a, b) => timbre[b]! - timbre[a]!)
    .slice(0, nPeaks);
  const share = new Array<number>(meter).fill(0);
  let tot = 0;
  for (const i of peaks) {
    share[i % meter]! += timbre[i]!;
    tot += timbre[i]!;
  }
  const struct = share.map((v) => (tot > 0 ? (v / tot - 1 / meter) * 2 : 0));
  return { kick: perPhase(kick), snare: perPhase(snare), chord: perPhase(chord), struct };
}

function chooseDownbeat(model: SongModel, beats: readonly number[], meter: number): number {
  const ev = downbeatEvidence(model, beats, meter);
  const score = ev.kick.map((k, p) => k - ev.snare[p]! + 2 * ev.chord[p]! + ev.struct[p]!);
  let best = 0;
  for (let p = 1; p < meter; p++) if (score[p]! > score[best]!) best = p;
  return best;
}

/**
 * Three beats to the bar or four. How sharply the harmony changes on one beat out of the bar is
 * the test (the biggest per-phase excess over the average, scaled so a change on every bar line
 * and nowhere else would score 1): counted correctly the changes stack up on one beat, counted
 * wrong they walk round the bar. Four unless three is clearly sharper, because a waltz called
 * 4/4 only shifts a downbeat while 4/4 called a waltz puts bars across every phrase.
 */
function chooseMeter(model: SongModel, beats: readonly number[]): number {
  const sharpness = (meter: number): number => Math.max(...downbeatEvidence(model, beats, meter).chord) / (meter - 1);
  const three = sharpness(3);
  return three > 0.15 && three > 2 * sharpness(4) ? 3 : 4;
}

export function buildGrid(model: SongModel, bpm: number, offset: number): Grid {
  const T = 60 / bpm;
  const startAt = Math.max(0, model.songStart - 0.1 * T);
  const k = Math.ceil((startAt - offset) / T);
  const beats: number[] = [];
  for (let i = 0; ; i++) {
    const t = offset + (k + i) * T;
    if (!(t < model.songEnd + 0.5 * T && t < model.duration)) break;
    beats.push(t);
  }
  return gridFromBeats(model, beats);
}

/**
 * The bar length, in beats, that a tracker's downbeats give: their usual spacing when they make
 * bars of a steady length (at least four bars and three in five the same 2-7 beats long), else 0.
 */
function barLength(beats: readonly number[], downbeats: readonly number[]): number {
  const given = downbeats.map((d) => beats.indexOf(d)).filter((i) => i >= 0);
  const lengths = given.slice(1).map((i, n) => i - given[n]!);
  const counts = new Map<number, number>();
  for (const l of lengths) counts.set(l, (counts.get(l) ?? 0) + 1);
  const [mode, modeCount] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  return lengths.length >= 4 && mode >= 2 && mode <= 7 && modeCount >= 0.6 * lengths.length ? mode : 0;
}

/** Above this a tracker's beat is a subdivision for lighting: the corpus counts beats a person would tap. */
const MAX_PRO_BPM = 200;

const medianGap = (beats: readonly number[]): number => {
  const gaps = beats.slice(1).map((b, i) => b - beats[i]!).sort((a, b) => a - b);
  return gaps[gaps.length >> 1] ?? 0.5;
};

/**
 * Beat This!'s beats and downbeats (seconds) made into what gridFromBeats takes.
 *
 * - Above 200 BPM the tracker has the quarter note of a fast 3/4 or the eighth of a fast 4/4
 *   (Carol of the Bells comes back at 250). An even bar keeps every other beat from each
 *   downbeat; an odd one makes its downbeats the beats, and this engine then finds the bars.
 * - The tracker reports only the beats it is sure of, so a free intro or a loose ending has none.
 *   The grid is carried on at the local tempo to the ends of the audible song, as buildGrid's is.
 */
export function proBeats(model: SongModel, beats: readonly number[], downbeats: readonly number[]): { beats: number[]; downbeats: number[] } {
  let b = [...beats];
  let d = [...downbeats];
  while (b.length > 16 && 60 / medianGap(b) > MAX_PRO_BPM) {
    if (barLength(b, d) % 2 === 1) {
      b = d.filter((t) => b.includes(t));
      d = [];
      continue;
    }
    const set = new Set(d);
    let k = Math.max(0, b.indexOf(d[0] ?? NaN)) % 2; // a pickup keeps the first downbeat's step
    b = b.filter((t) => {
      if (set.has(t)) k = 0;
      return k++ % 2 === 0;
    });
  }
  if (b.length < 2) return { beats: b, downbeats: d };
  const head = medianGap(b.slice(0, 9));
  const tail = medianGap(b.slice(-9));
  const before: number[] = [];
  for (let t = b[0]! - head; t >= Math.max(0, model.songStart - 0.1 * head); t -= head) before.unshift(t);
  const after: number[] = [];
  for (let t = b[b.length - 1]! + tail; t < model.songEnd + 0.5 * tail && t < model.duration; t += tail) after.push(t);
  return { beats: [...before, ...b, ...after], downbeats: d };
}

/**
 * Bars over a given list of beats (seconds).
 *
 * With `downbeats` (from Beat This!, the pro tracker) they are used as they come when they make
 * bars of a steady length (barLength), and the bar carries on at that length before the first of
 * them and after the last. A tracker that marks every beat a downbeat, or none, gets this
 * engine's own meter and downbeat choice over its beats instead.
 */
export function gridFromBeats(model: SongModel, beats: readonly number[], downbeats?: readonly number[]): Grid {
  const T = beats.length > 1 ? (beats[beats.length - 1]! - beats[0]!) / (beats.length - 1) : 0.5;
  const mode = barLength(beats, downbeats ?? []);

  let isDownbeat: (i: number) => boolean;
  let beatsPerBar: number;
  if (mode) {
    const given = (downbeats ?? []).map((d) => beats.indexOf(d)).filter((i) => i >= 0);
    const set = new Set(given);
    const first = given[0]!, last = given[given.length - 1]!;
    isDownbeat = (i) => (i < first ? (first - i) % mode === 0 : i > last ? (i - last) % mode === 0 : set.has(i));
    beatsPerBar = mode;
  } else {
    beatsPerBar = beats.length > 16 ? chooseMeter(model, beats) : 4;
    const shift = beats.length > beatsPerBar * 2 ? chooseDownbeat(model, beats, beatsPerBar) : 0;
    isDownbeat = (i) => ((i - shift) % beatsPerBar + beatsPerBar) % beatsPerBar === 0;
  }

  const downbeatTimes: number[] = [];
  const bars: Bar[] = [];
  for (let i = 0; i < beats.length; i++) {
    const beatEnd = i + 1 < beats.length ? beats[i + 1]! : Math.min(model.duration, beats[i]! + T);
    if (isDownbeat(i)) {
      downbeatTimes.push(beats[i]!);
      bars.push({ s: beats[i]!, e: beatEnd });
    } else if (bars.length > 0) {
      bars[bars.length - 1]!.e = beatEnd;
    }
  }
  return { beats: [...beats], downbeats: downbeatTimes, beatsPerBar, bars };
}

/**
 * Of the strong onsets that fall near a beat (within a quarter of its length), the fraction
 * within 40 ms of it. Hits further off the grid are syncopation, which is the music and not a
 * sign of a bad grid, so they are left out rather than counted as misses.
 */
export function gridFit(strong: readonly Onset[], beats: readonly number[], T: number): number {
  if (!strong.length || !beats.length) return 0;
  let near = 0;
  let close = 0;
  for (const o of strong) {
    const k = Math.round((o.t - beats[0]!) / T);
    const d = Math.abs(o.t - (beats[0]! + k * T));
    if (d > T / 4) continue;
    near++;
    if (d <= 0.04) close++;
  }
  return near ? close / near : 0;
}

// Ported from LightsAutoSequencer js/analysis.js (computergeek1507, GPL-3.0,
// https://github.com/computergeek1507/LightsAutoSequencer, commit b55d5b3f1e5162b41aa01aa29530e7d7fb4dceef).
//
// Changed from the original: synchronous and DOM-free (no OfflineAudioContext, no setTimeout
// yielding), so it can run in a worker or a test; the FFT is the engine's own fftInPlace instead
// of a private makeFFT; resampling to 22050 Hz is a plain box filter in TypeScript; the spectral
// features are returned as one object instead of being kept inside a closure; peak picking takes
// an explicit threshold so the hit detector can reuse it at a different sensitivity.
//
// The spectral flux here is the same idea as onsets.ts (half-wave rectified rise in the
// spectrum), computed on a finer grid. onsets.ts works on 16 coarse log bands at 50 ms, which
// cannot separate a kick (40-130 Hz) from a snare, so this has its own 1024-point frames.

import { fftInPlace } from "../audio";

export const SR = 22050;
export const N = 1024;
export const HOP = 256;
/** Feature frames per second (~86). */
export const FPS = SR / HOP;

const BAND_EDGES = [0, 100, 200, 400, 800, 1600, 3200, 6400, SR / 2];
const DRUM_BANDS = {
  kick: [40, 130],
  snare: [200, 2500],
  hat: [7000, 11000],
} as const;

export const frameTime = (f: number): number => (f * HOP) / SR;
export const timeFrame = (t: number): number => Math.max(0, Math.round((t * SR) / HOP));
const hzToBin = (hz: number): number => Math.round((hz * N) / SR);

export interface SongFeatures {
  nFrames: number;
  /** Full-band spectral flux. */
  flux: Float32Array;
  /** Flux restricted to the bins where each drum lives. */
  drum: { kick: Float32Array; snare: Float32Array; hat: Float32Array };
  rms: Float32Array;
  /** nFrames x 12 pitch-class energy. */
  chroma: Float32Array;
  /** nFrames x nb log10 band energy. */
  bands: Float32Array;
  nb: number;
}

/**
 * Mono at `to` Hz from mono at `from` Hz.
 *
 * Going down, every output sample is the average of the input it covers, with fractional weights
 * at the edges. That is a crude low-pass (a box filter leaks some of the top octave back down as
 * aliasing), but the analysis only looks at pitch classes, band energies and onsets, none of
 * which care about a little leakage above 11 kHz. A windowed-sinc would be the upgrade if hat
 * detection on 48 kHz material ever looks wrong. Going up it is linear interpolation.
 */
export function resampleMono(x: Float32Array, from: number, to: number = SR): Float32Array {
  if (from === to) return x;
  const outLength = Math.max(0, Math.floor((x.length * to) / from));
  const out = new Float32Array(outLength);
  const ratio = from / to;

  if (ratio <= 1) {
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = x[i0] ?? 0;
      const b = x[Math.min(x.length - 1, i0 + 1)] ?? a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  }

  for (let i = 0; i < outLength; i++) {
    const a = i * ratio;
    const b = Math.min(x.length, a + ratio);
    let sum = 0;
    const last = Math.ceil(b);
    for (let j = Math.floor(a); j < last; j++) {
      const w = Math.min(j + 1, b) - Math.max(j, a);
      sum += x[j]! * w;
    }
    out[i] = sum / (b - a);
  }
  return out;
}

export function spectralFeatures(
  x: Float32Array,
  progress?: (fraction: number, step: string) => void,
): SongFeatures {
  const nFrames = Math.floor(x.length / HOP) + 1;
  const half = N / 2;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let prev = new Float32Array(half);
  let cur = new Float32Array(half);

  const flux = new Float32Array(nFrames);
  const drum = {
    kick: new Float32Array(nFrames),
    snare: new Float32Array(nFrames),
    hat: new Float32Array(nFrames),
  };
  const drumKeys = ["kick", "snare", "hat"] as const;
  const drumRange = drumKeys.map((key) => [
    Math.max(1, hzToBin(DRUM_BANDS[key][0])),
    Math.min(half - 1, hzToBin(DRUM_BANDS[key][1])),
  ]);
  const rms = new Float32Array(nFrames);
  const chroma = new Float32Array(nFrames * 12);
  const nb = BAND_EDGES.length - 1;
  const bands = new Float32Array(nFrames * nb);

  // Which pitch class each FFT bin counts towards, between 80 Hz and 5 kHz where chords live.
  const pcOfBin = new Int8Array(half).fill(-1);
  for (let k = hzToBin(80); k <= hzToBin(5000); k++) {
    const midi = 69 + 12 * Math.log2(((k * SR) / N) / 440);
    pcOfBin[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const bandOfBin = new Int8Array(half);
  for (let k = 0; k < half; k++) {
    const f = (k * SR) / N;
    let b = 0;
    while (b < nb - 1 && f >= BAND_EDGES[b + 1]!) b++;
    bandOfBin[k] = b;
  }

  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP - half; // centred frames: frame f is centred on f*HOP
    let sumsq = 0;
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      const s = idx >= 0 && idx < x.length ? x[idx]! : 0;
      sumsq += s * s;
      re[i] = s * win[i]!;
      im[i] = 0;
    }
    rms[f] = Math.sqrt(sumsq / N);
    fftInPlace(re, im);

    let total = 0;
    const cOff = f * 12;
    const bOff = f * nb;
    for (let k = 1; k < half; k++) {
      const mag = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!);
      const lm = Math.log1p(10 * mag);
      cur[k] = lm;
      const d = lm - prev[k]!;
      if (d > 0) total += d;
      const pc = pcOfBin[k]!;
      if (pc >= 0) chroma[cOff + pc]! += mag;
      bands[bOff + bandOfBin[k]!]! += mag * mag;
    }
    for (let d = 0; d < drumKeys.length; d++) {
      const [lo, hi] = drumRange[d]!;
      let s = 0;
      for (let k = lo!; k <= hi!; k++) {
        const diff = cur[k]! - prev[k]!;
        if (diff > 0) s += diff;
      }
      drum[drumKeys[d]!][f] = s;
    }
    flux[f] = f === 0 ? 0 : total;
    for (let b = 0; b < nb; b++) bands[bOff + b] = Math.log10(bands[bOff + b]! + 1e-6);

    const t = prev;
    prev = cur;
    cur = t;
    if ((f & 2047) === 0) progress?.(0.1 + 0.6 * (f / nFrames), "Reading the spectrum");
  }
  // The first frame is compared with silence, which would read as one enormous onset.
  for (const key of drumKeys) drum[key][0] = 0;
  return { nFrames, flux, drum, rms, chroma, bands, nb };
}

function movingMedian(a: Float32Array, halfWin: number): Float32Array {
  const out = new Float32Array(a.length);
  const buf = new Float32Array(2 * halfWin + 1);
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(a.length - 1, i + halfWin);
    const w = buf.subarray(0, hi - lo + 1);
    w.set(a.subarray(lo, hi + 1));
    w.sort();
    out[i] = w[w.length >> 1]!;
  }
  return out;
}

/**
 * Novelty after removing the local median, so a steady loud passage is not mistaken for a run
 * of onsets.
 */
export function detrend(n: Float32Array): Float32Array {
  const med = movingMedian(n, Math.round(0.25 * FPS));
  const z = new Float32Array(n.length);
  for (let i = 0; i < n.length; i++) z[i] = Math.max(0, n[i]! - med[i]!);
  return z;
}

export function meanStd(a: ArrayLike<number>): [number, number] {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i]!;
    s2 += a[i]! * a[i]!;
  }
  const m = s / (a.length || 1);
  return [m, Math.sqrt(Math.max(0, s2 / (a.length || 1) - m * m))];
}

export interface Onset {
  /** Seconds. */
  t: number;
  /** 0..1, relative to the strongest onset found. */
  s: number;
}

/**
 * Local maxima of `z` above `threshold`, at least `minGapSec` apart, inside the audible part of
 * the song. A peak that lands inside the minimum gap of the last one replaces it if it is
 * stronger, so a hit smeared over a few frames yields one onset at its loudest.
 */
export function pickPeaks(
  z: Float32Array,
  { threshold, minGapSec, active }: { threshold: number; minGapSec: number; active: Uint8Array },
): Onset[] {
  const lw = 3;
  const minGap = Math.max(1, Math.round(minGapSec * FPS));
  const peaks: { f: number; s: number }[] = [];
  for (let i = 1; i < z.length - 1; i++) {
    const v = z[i]!;
    if (v <= threshold || !active[i]) continue;
    let isMax = true;
    for (let j = Math.max(0, i - lw); j <= Math.min(z.length - 1, i + lw); j++) {
      if (z[j]! > v || (z[j] === v && j < i)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const last = peaks[peaks.length - 1];
    if (last && i - last.f < minGap) {
      if (v > last.s) {
        last.f = i;
        last.s = v;
      }
      continue;
    }
    peaks.push({ f: i, s: v });
  }
  let maxS = 0;
  for (const p of peaks) maxS = Math.max(maxS, p.s);
  return peaks.map((p) => ({ t: frameTime(p.f), s: maxS > 0 ? p.s / maxS : 0 }));
}

/** The reference's threshold: `sensitivity` standard deviations above the mean. */
export function sdThreshold(z: Float32Array, sensitivity: number): number {
  const [m, sd] = meanStd(z);
  return m + sensitivity * sd;
}

/** What the grid, section and energy code read: the spectral features plus the onsets found in them. */
export interface SongModel {
  feat: SongFeatures;
  onsets: { all: Onset[]; kick: Onset[]; snare: Onset[] };
  /** Seconds. The first and last moments louder than -40 dB below the loudest frame. */
  songStart: number;
  songEnd: number;
  /** Seconds. */
  duration: number;
}

// Beat This! (Foscarin, Schlüter and Widmer, ISMIR 2024), the "pro" beat tracker of Magic
// Sequence's song analysis (docs/MAGIC-SEQUENCE.md 2.1). Ported from
// https://github.com/CPJKU/beat_this (MIT, Institute of Computational Perception, JKU Linz):
// the log-mel front end of beat_this/preprocessing.py (torchaudio's MelSpectrogram), the chunking
// of beat_this/inference.py and the "minimal" postprocessor of beat_this/model/postprocessor.py.
// The network itself runs as ONNX in the app's analysis worker; this file is the DSP around it,
// kept DOM-free and tested against the Python pipeline's own output
// (tools/beat-this/export_onnx.py writes the fixture).
//
// Changed from the original: resampling to 22.05 kHz uses this engine's resampler instead of
// soxr, and the DBN postprocessor (madmom, non-commercial weights) is not ported.

import { fftInPlace } from "../audio";
import { resampleMono } from "./features";

export const BEAT_THIS_SR = 22050;
export const BEAT_THIS_FPS = 50;
export const BEAT_THIS_MELS = 128;
const N_FFT = 1024;
const HOP = 441;
const F_MIN = 30;
const F_MAX = 11000;
const CHUNK = 1500;
const BORDER = 6;

// Slaney's mel scale, as torchaudio's mel_scale="slaney": linear below 1 kHz, logarithmic above.
const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOGSTEP = Math.log(6.4) / 27;
const hzToMel = (f: number) => (f < MIN_LOG_HZ ? f / F_SP : MIN_LOG_MEL + Math.log(f / MIN_LOG_HZ) / LOGSTEP);
const melToHz = (m: number) => (m < MIN_LOG_MEL ? m * F_SP : MIN_LOG_HZ * Math.exp(LOGSTEP * (m - MIN_LOG_MEL)));

let filterbank: Float64Array | null = null;
/** torchaudio.functional.melscale_fbanks(513, 30, 11000, 128, 22050, norm=None, "slaney"), bins x mels. */
function melFilterbank(): Float64Array {
  if (filterbank) return filterbank;
  const nFreqs = N_FFT / 2 + 1;
  const fb = new Float64Array(nFreqs * BEAT_THIS_MELS);
  const nyquist = Math.floor(BEAT_THIS_SR / 2);
  const allFreqs = Array.from({ length: nFreqs }, (_, i) => (i * nyquist) / (nFreqs - 1));
  const mMin = hzToMel(F_MIN), mMax = hzToMel(F_MAX);
  const fPts = Array.from({ length: BEAT_THIS_MELS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (BEAT_THIS_MELS + 1)));
  for (let k = 0; k < nFreqs; k++) {
    for (let m = 0; m < BEAT_THIS_MELS; m++) {
      const down = (allFreqs[k]! - fPts[m]!) / (fPts[m + 1]! - fPts[m]!);
      const up = (fPts[m + 2]! - allFreqs[k]!) / (fPts[m + 2]! - fPts[m + 1]!);
      fb[k * BEAT_THIS_MELS + m] = Math.max(0, Math.min(down, up));
    }
  }
  return (filterbank = fb);
}

/**
 * The model's input: log1p(1000 * mel magnitude), frames x 128, row-major, at 50 frames a second.
 *
 * `samples` must already be mono at 22.05 kHz. The STFT is torch's: a periodic Hann window,
 * centred frames with reflect padding, and the magnitude divided by sqrt(n_fft) (torchaudio's
 * normalized="frame_length").
 */
export function beatThisLogMel(samples: Float32Array): { frames: number; data: Float32Array } {
  const pad = N_FFT / 2;
  const n = samples.length;
  // numpy/torch "reflect": the edge sample is not repeated.
  const at = (i: number): number => {
    if (n <= 1) return samples[0] ?? 0;
    let j = i;
    while (j < 0 || j >= n) j = j < 0 ? -j : 2 * (n - 1) - j;
    return samples[j]!;
  };
  const frames = 1 + Math.floor(n / HOP);
  const window = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  const fb = melFilterbank();
  const nFreqs = N_FFT / 2 + 1;
  const scale = 1 / Math.sqrt(N_FFT);
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT), mag = new Float64Array(nFreqs);
  const data = new Float32Array(frames * BEAT_THIS_MELS);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP - pad;
    for (let i = 0; i < N_FFT; i++) {
      re[i] = at(start + i) * window[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < nFreqs; k++) mag[k] = Math.hypot(re[k]!, im[k]!) * scale;
    for (let m = 0; m < BEAT_THIS_MELS; m++) {
      let s = 0;
      for (let k = 0; k < nFreqs; k++) s += mag[k]! * fb[k * BEAT_THIS_MELS + m]!;
      data[f * BEAT_THIS_MELS + m] = Math.log1p(1000 * s);
    }
  }
  return { frames, data };
}

export interface BeatThisChunk {
  /** First frame of the chunk in the piece; negative for the first, which is padded. */
  start: number;
  /** The piece's frames [from, to) the chunk holds, with zero frames either side of them. */
  from: number;
  to: number;
  padLeft: number;
  padRight: number;
}

/** inference.py's split_piece: 30 s chunks, 6-frame borders, the last chunk moved to end on the piece. */
export function beatThisChunks(frames: number): BeatThisChunk[] {
  const starts: number[] = [];
  for (let s = -BORDER; s < frames - BORDER; s += CHUNK - 2 * BORDER) starts.push(s);
  if (frames > CHUNK - 2 * BORDER) starts[starts.length - 1] = frames - (CHUNK - BORDER);
  return starts.map((start) => ({
    start,
    from: Math.max(start, 0),
    to: Math.min(start + CHUNK, frames),
    padLeft: Math.max(0, -start),
    padRight: Math.max(0, Math.min(BORDER, start + CHUNK - frames)),
  }));
}

/** Runs the model on one chunk of frames x 128 log-mel and returns its two logit rows. */
export type BeatThisInfer = (spect: Float32Array, frames: number) => Promise<{ beat: Float32Array; downbeat: Float32Array }>;

/** Frame-wise beat and downbeat logits for a whole piece, chunk by chunk, as inference.py aggregates them. */
export async function beatThisLogits(spect: { frames: number; data: Float32Array }, infer: BeatThisInfer, onChunk?: (done: number, total: number) => void): Promise<{ beat: Float32Array; downbeat: Float32Array }> {
  const { frames, data } = spect;
  const beat = new Float32Array(frames).fill(-1000);
  const downbeat = new Float32Array(frames).fill(-1000);
  const chunks = beatThisChunks(frames);
  // keep_first: earlier chunks win their overlap, so write them last.
  const results: { chunk: BeatThisChunk; beat: Float32Array; downbeat: Float32Array }[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const length = chunk.padLeft + (chunk.to - chunk.from) + chunk.padRight;
    const input = new Float32Array(length * BEAT_THIS_MELS);
    input.set(data.subarray(chunk.from * BEAT_THIS_MELS, chunk.to * BEAT_THIS_MELS), chunk.padLeft * BEAT_THIS_MELS);
    results.push({ chunk, ...(await infer(input, length)) });
    onChunk?.(i + 1, chunks.length);
  }
  for (const { chunk, beat: b, downbeat: d } of results.reverse()) {
    const end = Math.min(chunk.start + CHUNK - BORDER, frames);
    for (let t = chunk.start + BORDER; t < end; t++) {
      beat[t] = b[t - chunk.start]!;
      downbeat[t] = d[t - chunk.start]!;
    }
  }
  return { beat, downbeat };
}

/** Frames that are the maximum of their +/-3 neighbours and above 0 (probability 0.5). */
function peakFrames(logits: Float32Array): number[] {
  const peaks: number[] = [];
  for (let t = 0; t < logits.length; t++) {
    const v = logits[t]!;
    if (!(v > 0)) continue;
    let max = -Infinity;
    for (let j = Math.max(0, t - 3); j <= Math.min(logits.length - 1, t + 3); j++) max = Math.max(max, logits[j]!);
    if (v === max) peaks.push(t);
  }
  return peaks;
}

/** Adjacent peak frames (no more than a frame apart) become their running mean, as deduplicate_peaks. */
function deduplicate(peaks: readonly number[]): number[] {
  const out: number[] = [];
  if (peaks.length === 0) return out;
  let p = peaks[0]!;
  let c = 1;
  for (const p2 of peaks.slice(1)) {
    if (p2 - p <= 1) {
      c++;
      p += (p2 - p) / c;
    } else {
      out.push(p);
      p = p2;
      c = 1;
    }
  }
  out.push(p);
  return out;
}

/** The "minimal" postprocessor: beat and downbeat times in seconds, every downbeat on a beat. */
export function beatThisPeaks(beat: Float32Array, downbeat: Float32Array): { beats: number[]; downbeats: number[] } {
  const beats = deduplicate(peakFrames(beat)).map((f) => f / BEAT_THIS_FPS);
  let downbeats = deduplicate(peakFrames(downbeat)).map((f) => f / BEAT_THIS_FPS);
  if (beats.length) {
    downbeats = downbeats.map((d) => {
      let best = 0;
      for (let i = 1; i < beats.length; i++) if (Math.abs(beats[i]! - d) < Math.abs(beats[best]! - d)) best = i;
      return beats[best]!;
    });
  }
  return { beats, downbeats: [...new Set(downbeats)].sort((a, b) => a - b) };
}

/** Beat and downbeat times in seconds for a mono track at any rate: the whole pipeline around the network. */
export async function beatThisGrid(samples: Float32Array, sampleRate: number, infer: BeatThisInfer, onChunk?: (done: number, total: number) => void): Promise<{ beats: number[]; downbeats: number[] }> {
  const { beat, downbeat } = await beatThisLogits(beatThisLogMel(resampleMono(samples, sampleRate, BEAT_THIS_SR)), infer, onChunk);
  return beatThisPeaks(beat, downbeat);
}

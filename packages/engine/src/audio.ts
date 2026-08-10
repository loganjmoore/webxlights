// Per-frame audio analysis feeding the audio-reactive effects (VU Meter). SPEC ch8's VU Meter
// family needs a level + spectrum for the frame being rendered; M6 never had one because M2's
// audio pipeline only computes waveform peaks for the display strip.
//
// This is deliberately an *offline* analysis over the whole decoded track rather than a live
// AnalyserNode tap: rendering has to be deterministic (SPEC ch10/16 — same input, same frames)
// and a full sequence export renders far faster than real time, so there is no live audio to
// tap at export time anyway. Analysing once up front gives both the preview and the export the
// same numbers.

export interface AudioFrame {
  level: number; // 0..1 overall loudness (normalised RMS)
  bands: number[]; // 0..1 per frequency band, low to high
}

export interface AudioSeries {
  frameMs: number;
  bandCount: number;
  frames: AudioFrame[];
}

export const SILENT_AUDIO_FRAME: AudioFrame = { level: 0, bands: [] };

// Iterative radix-2 Cooley-Tukey. `re`/`im` are modified in place; length must be a power of 2.
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fftInPlace: length ${n} is not a power of 2`);

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const vIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// Magnitude spectrum (first half of the transform — the rest mirrors it for real input).
export function fftMagnitudes(samples: ArrayLike<number>): number[] {
  const n = 1 << Math.max(1, Math.ceil(Math.log2(Math.max(2, samples.length))));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < samples.length && i < n; i++) {
    // Hann window: keeps a frame's edges from ringing across the whole spectrum
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, samples.length - 1));
    re[i] = samples[i]! * w;
  }
  fftInPlace(re, im);

  const half = n / 2;
  const out: number[] = new Array(half);
  for (let i = 0; i < half; i++) out[i] = Math.hypot(re[i]!, im[i]!);
  return out;
}

const WINDOW_SIZE = 1024;

// One AudioFrame per sequence frame. Bands are grouped logarithmically (bass gets fewer bins
// than treble in linear FFT space, which is backwards from how the ear — and a VU meter —
// divides the spectrum), then the whole series is normalised against its own maximum so a
// quiet track still drives the full 0..1 range.
export function analyzeAudio(
  channelData: ArrayLike<number>,
  sampleRate: number,
  frameMs: number,
  bandCount = 16,
  durationMs?: number,
): AudioSeries {
  const samplesPerFrame = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const totalMs = durationMs ?? (channelData.length / sampleRate) * 1000;
  const frameCount = Math.max(1, Math.ceil(totalMs / frameMs));

  const rawLevels: number[] = new Array(frameCount);
  const rawBands: number[][] = new Array(frameCount);

  const window = new Float64Array(WINDOW_SIZE);
  const bandEdges = logBandEdges(WINDOW_SIZE / 2, bandCount);

  for (let f = 0; f < frameCount; f++) {
    const start = f * samplesPerFrame;
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const idx = start + i;
      const v = idx < channelData.length ? channelData[idx]! : 0;
      window[i] = v;
      if (i < samplesPerFrame && idx < channelData.length) {
        sumSq += v * v;
        count++;
      }
    }
    rawLevels[f] = count > 0 ? Math.sqrt(sumSq / count) : 0;

    const mags = fftMagnitudes(window);
    const bands: number[] = new Array(bandCount);
    for (let b = 0; b < bandCount; b++) {
      const lo = bandEdges[b]!;
      const hi = bandEdges[b + 1]!;
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += mags[i]!;
      bands[b] = hi > lo ? sum / (hi - lo) : 0;
    }
    rawBands[f] = bands;
  }

  const maxLevel = Math.max(1e-9, ...rawLevels);
  const maxBand = Math.max(1e-9, ...rawBands.map((b) => Math.max(0, ...b)));

  const frames: AudioFrame[] = rawLevels.map((level, f) => ({
    level: Math.min(1, level / maxLevel),
    bands: rawBands[f]!.map((v) => Math.min(1, v / maxBand)),
  }));

  return { frameMs, bandCount, frames };
}

function logBandEdges(binCount: number, bandCount: number): number[] {
  const edges: number[] = [];
  for (let b = 0; b <= bandCount; b++) {
    const t = b / bandCount;
    // skip bin 0 (DC) and spread the rest logarithmically to the Nyquist bin
    const bin = Math.round(Math.pow(binCount, t));
    edges.push(Math.min(binCount, Math.max(1, bin)));
  }
  // guarantee strictly non-decreasing edges even when bandCount > binCount
  for (let b = 1; b < edges.length; b++) if (edges[b]! < edges[b - 1]!) edges[b] = edges[b - 1]!;
  return edges;
}

export function audioFrameAt(series: AudioSeries | undefined, atMs: number): AudioFrame {
  if (!series || series.frames.length === 0) return SILENT_AUDIO_FRAME;
  const idx = Math.max(0, Math.min(series.frames.length - 1, Math.floor(atMs / series.frameMs)));
  return series.frames[idx]!;
}

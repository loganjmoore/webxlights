import type { AudioSeries } from "./audio";

// Finding the beats in a track, for xLights' audio-generated timing tracks.
//
// The fixed-interval and metronome generators put marks at a rate you choose. This puts them
// where something actually happens - which is what makes a timing track usable for sequencing to
// a song rather than to a click.
//
// The method is spectral flux: how much the spectrum *rose* between one frame and the next, summed
// across the bands. A drum hit raises many bands at once, so it produces a spike; a sustained note
// holds its bands steady and produces nothing after its first frame. Only rises count - a note
// ending is not an onset, and counting falls would double every hit.
//
// The threshold is local rather than global. A quiet verse and a loud chorus have different
// baselines, and a fixed threshold either floods the chorus with marks or finds nothing in the
// verse; comparing each frame against its own neighbourhood is what makes one setting work across
// a whole song.

export type OnsetBand = "all" | "low" | "mid" | "high";

export interface OnsetOptions {
  /**
   * 0..100. Higher finds more, by demanding less of a rise above the local baseline.
   *
   * Not a raw threshold, because the useful range of one depends on the track; this maps onto a
   * multiplier of the local mean, which is comparable across songs.
   */
  sensitivity?: number;
  /**
   * The shortest gap between two marks. A drum hit spreads over several frames, and without this
   * a single beat becomes a cluster - which reads as a working detector until you zoom in.
   */
  minGapMs?: number;
  /**
   * Which part of the spectrum to listen to. "low" follows the kick, "high" the hats; "all" is
   * everything and is what most tracks want.
   */
  band?: OnsetBand;
  /** Keep only every Nth onset - a rough way to get bars from beats. */
  everyNth?: number;
}

/** Frames either side of a frame that form its local baseline (~0.5s at 50ms frames). */
const LOCAL_WINDOW_FRAMES = 10;

function bandRange(band: OnsetBand, bandCount: number): [number, number] {
  if (bandCount === 0) return [0, 0];
  const third = Math.max(1, Math.floor(bandCount / 3));
  if (band === "low") return [0, third];
  if (band === "mid") return [third, Math.min(bandCount, third * 2)];
  if (band === "high") return [Math.min(bandCount - 1, third * 2), bandCount];
  return [0, bandCount];
}

/**
 * Half-wave rectified spectral flux, one value per frame.
 *
 * Exported because it is the whole basis of the detection: a test that can see the flux can say
 * why a mark was or wasn't placed, rather than only that the count changed.
 */
export function spectralFlux(series: AudioSeries, band: OnsetBand = "all"): number[] {
  const frames = series.frames;
  const [from, to] = bandRange(band, series.bandCount || (frames[0]?.bands.length ?? 0));
  const flux: number[] = new Array(frames.length).fill(0);

  for (let f = 1; f < frames.length; f++) {
    const now = frames[f]!.bands;
    const before = frames[f - 1]!.bands;
    let sum = 0;
    for (let b = from; b < to; b++) {
      const rise = (now[b] ?? 0) - (before[b] ?? 0);
      if (rise > 0) sum += rise;
    }
    // A track with no spectrum at all (bandCount 0) still has a level, and following that is
    // better than reporting no onsets for every frame.
    flux[f] = to > from ? sum : Math.max(0, frames[f]!.level - frames[f - 1]!.level);
  }
  return flux;
}

/**
 * The times, in milliseconds, where the track's spectrum rises sharply.
 *
 * A frame qualifies when it is a local peak *and* stands above its own neighbourhood. Both
 * conditions matter: without the peak test a single hit marks every frame of its attack, and
 * without the neighbourhood test a loud section marks continuously.
 */
export function detectOnsets(series: AudioSeries, options: OnsetOptions = {}): number[] {
  const frames = series.frames;
  if (frames.length < 2) return [];

  const sensitivity = Math.max(0, Math.min(100, options.sensitivity ?? 50));
  // 2.2x the local mean at the least sensitive end, 1.05x at the most.
  const multiplier = 2.2 - (sensitivity / 100) * 1.15;
  const minGapMs = Math.max(0, options.minGapMs ?? 120);
  const flux = spectralFlux(series, options.band ?? "all");

  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  // A floor relative to the whole track, so near-silence doesn't produce marks from rounding.
  const floor = mean * 0.1;

  const onsets: number[] = [];
  let lastMs = -Infinity;

  for (let f = 1; f < flux.length - 1; f++) {
    const value = flux[f]!;
    if (value <= floor) continue;
    if (value < flux[f - 1]! || value < flux[f + 1]!) continue; // not a local peak

    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, f - LOCAL_WINDOW_FRAMES); i <= Math.min(flux.length - 1, f + LOCAL_WINDOW_FRAMES); i++) {
      sum += flux[i]!;
      count++;
    }
    const local = count > 0 ? sum / count : 0;
    if (value < local * multiplier) continue;

    const atMs = f * series.frameMs;
    if (atMs - lastMs < minGapMs) continue;
    onsets.push(atMs);
    lastMs = atMs;
  }

  const nth = Math.max(1, Math.floor(options.everyNth ?? 1));
  return nth === 1 ? onsets : onsets.filter((_, i) => i % nth === 0);
}

/**
 * A tempo estimate from the gaps between onsets, or null when they're too irregular to call one.
 *
 * Reported rather than acted on: it tells you whether the detection found a beat or found noise,
 * which is the question you have after looking at a track full of new marks. Deliberately not used
 * to snap or quantise anything - a wrong estimate would then move real marks to wrong places.
 */
export function estimateTempo(onsets: readonly number[]): number | null {
  if (onsets.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i]! - onsets[i - 1]!);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  if (median <= 0) return null;

  // Only gaps near the median count towards the average, so one long pause between sections
  // doesn't drag the estimate down.
  const near = gaps.filter((g) => Math.abs(g - median) <= median * 0.25);
  if (near.length < gaps.length / 2) return null; // no consistent gap: not a tempo
  const average = near.reduce((a, b) => a + b, 0) / near.length;

  const bpm = 60000 / average;
  // Fold into the range people read tempos in, the way every beat detector does.
  let folded = bpm;
  while (folded < 70) folded *= 2;
  while (folded > 180) folded /= 2;
  return Math.round(folded);
}

import { describe, expect, it } from "vitest";
import type { AudioSeries } from "../src/audio";
import { detectOnsets, estimateTempo, spectralFlux } from "../src/onsets";

const FRAME_MS = 50;
const BANDS = 12;

/**
 * A synthesised track: quiet everywhere, with a burst across every band on the named frames.
 *
 * Synthesised rather than decoded from a file because it makes the assertions exact - a hit is on
 * frame 10 or it isn't - and because a real track's beats are a judgement call, which is not what
 * these tests are for.
 */
function seriesWithHits(frameCount: number, hitFrames: number[], strength = 1): AudioSeries {
  const hits = new Set(hitFrames);
  const frames = Array.from({ length: frameCount }, (_, f) => {
    const level = hits.has(f) ? strength : 0.05;
    return { level, bands: new Array(BANDS).fill(level) };
  });
  return { frameMs: FRAME_MS, bandCount: BANDS, frames };
}

describe("spectral flux", () => {
  it("rises where the spectrum rises and stays flat where it falls", () => {
    const flux = spectralFlux(seriesWithHits(10, [4]));
    expect(flux[4]).toBeGreaterThan(0); // the attack
    expect(flux[5]).toBe(0); // the release: a note ending is not an onset
  });

  it("listens to only part of the spectrum when asked", () => {
    // A kick in the low bands and nothing above it: "high" should find nothing.
    const frames = Array.from({ length: 8 }, (_, f) => {
      const low = f === 4 ? 1 : 0.05;
      return { level: low, bands: [...new Array(4).fill(low), ...new Array(BANDS - 4).fill(0.05)] };
    });
    const series: AudioSeries = { frameMs: FRAME_MS, bandCount: BANDS, frames };
    expect(spectralFlux(series, "low")[4]).toBeGreaterThan(0);
    expect(spectralFlux(series, "high")[4]).toBe(0);
  });
});

describe("onset detection", () => {
  it("finds a mark at each hit, at the hit's own time", () => {
    const onsets = detectOnsets(seriesWithHits(60, [10, 20, 30, 40]));
    expect(onsets).toEqual([500, 1000, 1500, 2000]);
  });

  it("finds nothing in silence", () => {
    expect(detectOnsets(seriesWithHits(40, []))).toEqual([]);
  });

  it("marks a sustained note once, not once per frame", () => {
    // The sound stays loud for a second. Only its attack is an onset - everything after it is the
    // same note still sounding.
    const frames = Array.from({ length: 40 }, (_, f) => {
      const level = f >= 10 && f < 30 ? 1 : 0.05;
      return { level, bands: new Array(BANDS).fill(level) };
    });
    const onsets = detectOnsets({ frameMs: FRAME_MS, bandCount: BANDS, frames });
    expect(onsets).toEqual([500]);
  });

  it("keeps two hits apart but collapses a cluster inside the minimum gap", () => {
    // Frames 10 and 11 are one drum hit spread over two frames; frame 30 is a separate beat.
    const onsets = detectOnsets(seriesWithHits(50, [10, 11, 30]), { minGapMs: 200 });
    expect(onsets).toEqual([500, 1500]);
  });

  it("finds more as sensitivity rises", () => {
    // Hits of two different strengths: a low sensitivity should find only the loud ones.
    const frames = Array.from({ length: 80 }, (_, f) => {
      const strong = f % 20 === 0 && f > 0;
      const weak = f % 20 === 10;
      const level = strong ? 1 : weak ? 0.25 : 0.05;
      return { level, bands: new Array(BANDS).fill(level) };
    });
    const series: AudioSeries = { frameMs: FRAME_MS, bandCount: BANDS, frames };
    const few = detectOnsets(series, { sensitivity: 0 });
    const many = detectOnsets(series, { sensitivity: 100 });
    expect(many.length).toBeGreaterThan(few.length);
  });

  it("keeps every Nth onset when asked, which is roughly how bars come from beats", () => {
    const every = detectOnsets(seriesWithHits(90, [10, 20, 30, 40, 50, 60, 70, 80]));
    const fourth = detectOnsets(seriesWithHits(90, [10, 20, 30, 40, 50, 60, 70, 80]), { everyNth: 4 });
    expect(every).toHaveLength(8);
    expect(fourth).toEqual([every[0], every[4]]);
  });

  it("survives a series with no spectrum by following the level instead", () => {
    // bandCount 0 shouldn't mean "no onsets ever" - a level is still something to follow.
    const frames = Array.from({ length: 40 }, (_, f) => ({ level: f === 10 || f === 25 ? 1 : 0.05, bands: [] }));
    const onsets = detectOnsets({ frameMs: FRAME_MS, bandCount: 0, frames });
    expect(onsets).toEqual([500, 1250]);
  });

  it("returns nothing for a track too short to have neighbours", () => {
    expect(detectOnsets({ frameMs: FRAME_MS, bandCount: BANDS, frames: [] })).toEqual([]);
  });
});

describe("tempo estimate", () => {
  it("reads the tempo of evenly spaced beats", () => {
    // A beat every 500ms is 120bpm.
    expect(estimateTempo([0, 500, 1000, 1500, 2000, 2500])).toBe(120);
  });

  it("folds a fast or slow reading into the range tempos are read in", () => {
    // Every 250ms is 240bpm, which is how a detector reporting eighth-notes looks; halved it is
    // the 120 a person would say.
    expect(estimateTempo([0, 250, 500, 750, 1000, 1250])).toBe(120);
  });

  it("ignores one long pause between sections", () => {
    const withGap = [0, 500, 1000, 1500, 6000, 6500, 7000, 7500];
    expect(estimateTempo(withGap)).toBe(120);
  });

  it("declines to call a tempo on irregular onsets", () => {
    expect(estimateTempo([0, 130, 900, 950, 3000, 3400])).toBeNull();
  });

  it("declines when there is barely anything to go on", () => {
    expect(estimateTempo([0, 500])).toBeNull();
  });
});

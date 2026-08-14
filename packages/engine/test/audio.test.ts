import { describe, expect, it } from "vitest";
import { analyzeAudio, audioFrameAt, bandsForNoteRange, fftInPlace, fftMagnitudes, noteFrequency, SILENT_AUDIO_FRAME } from "../src/audio";

function sine(freqHz: number, sampleRate: number, sampleCount: number, amplitude = 1): Float32Array {
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return out;
}

describe("Audio analysis (feeds the VU Meter family, SPEC ch8)", () => {
  it("fftInPlace rejects a non-power-of-2 length rather than returning garbage", () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow(/power of 2/);
  });

  it("a pure tone peaks in the FFT bin matching its frequency", () => {
    const sampleRate = 8192;
    const size = 1024;
    const freq = 512; // bin = freq / (sampleRate / size) = 512 / 8 = 64
    const mags = fftMagnitudes(sine(freq, sampleRate, size));

    let peakBin = 0;
    for (let i = 1; i < mags.length; i++) if (mags[i]! > mags[peakBin]!) peakBin = i;
    expect(peakBin).toBeGreaterThanOrEqual(63);
    expect(peakBin).toBeLessThanOrEqual(65);
  });

  it("a louder passage analyses to a higher level than a quiet one", () => {
    const sampleRate = 8000;
    const frameMs = 50;
    const samplesPerFrame = (sampleRate * frameMs) / 1000;
    const data = new Float32Array(samplesPerFrame * 4);
    const loud = sine(440, sampleRate, samplesPerFrame, 1);
    const quiet = sine(440, sampleRate, samplesPerFrame, 0.05);
    data.set(loud, 0);
    data.set(quiet, samplesPerFrame);
    data.set(loud, samplesPerFrame * 2);
    data.set(quiet, samplesPerFrame * 3);

    const series = analyzeAudio(data, sampleRate, frameMs, 8);
    expect(series.frames.length).toBe(4);
    expect(series.frames[0]!.level).toBeGreaterThan(series.frames[1]!.level);
    expect(series.frames[0]!.bands.length).toBe(8);
  });

  it("levels and bands are normalised into 0..1", () => {
    const series = analyzeAudio(sine(220, 8000, 8000, 0.9), 8000, 50, 12);
    for (const frame of series.frames) {
      expect(frame.level).toBeGreaterThanOrEqual(0);
      expect(frame.level).toBeLessThanOrEqual(1);
      for (const b of frame.bands) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
      }
    }
  });

  it("a bass tone lands in a lower band than a treble tone", () => {
    const sampleRate = 8000;
    const bass = analyzeAudio(sine(80, sampleRate, sampleRate, 1), sampleRate, 50, 8);
    const treble = analyzeAudio(sine(3000, sampleRate, sampleRate, 1), sampleRate, 50, 8);
    const loudestBand = (bands: number[]): number => bands.indexOf(Math.max(...bands));
    expect(loudestBand(bass.frames[4]!.bands)).toBeLessThan(loudestBand(treble.frames[4]!.bands));
  });

  it("silence analyses without dividing by zero", () => {
    const series = analyzeAudio(new Float32Array(4000), 8000, 50, 8);
    expect(series.frames.every((f) => f.level === 0)).toBe(true);
  });

  it("audioFrameAt indexes by time and clamps past the end", () => {
    const series = analyzeAudio(sine(440, 8000, 8000, 1), 8000, 50, 8);
    expect(audioFrameAt(series, 0)).toBe(series.frames[0]);
    expect(audioFrameAt(series, 125)).toBe(series.frames[2]);
    expect(audioFrameAt(series, 999_999)).toBe(series.frames[series.frames.length - 1]);
  });

  it("audioFrameAt with no series reads as silence rather than throwing", () => {
    expect(audioFrameAt(undefined, 500)).toBe(SILENT_AUDIO_FRAME);
  });
});

describe("notes against the analysed bands", () => {
  it("gives a note its frequency", () => {
    expect(noteFrequency(69)).toBeCloseTo(440, 5); // A4
    expect(noteFrequency(60)).toBeCloseTo(261.63, 1); // C4
    expect(noteFrequency(81)).toBeCloseTo(880, 5); // an octave above A4
  });

  it("finds the bands a note range covers", () => {
    const series = { frameMs: 50, bandCount: 4, frames: [], bandEdgesHz: [100, 200, 400, 800, 1600] };
    // C5 is 523Hz, which is inside the 400-800Hz band and nothing else.
    expect(bandsForNoteRange(series, 72, 72)).toEqual([2, 3]);
    // A range spanning C4 (262Hz) to C6 (1047Hz) reaches across three of them.
    expect(bandsForNoteRange(series, 60, 84)).toEqual([1, 4]);
  });

  it("says nothing when the series doesn't record where its bands sit", () => {
    // A series analysed before this was recorded, or a hand-built one. Widening to the whole
    // spectrum instead would make a note-range effect look like it was working.
    expect(bandsForNoteRange({ frameMs: 50, bandCount: 4, frames: [] }, 60, 72)).toBeNull();
  });

  it("records the band edges in hertz when it analyses a track", () => {
    const samples = new Float32Array(4096).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100));
    const series = analyzeAudio(samples, 44100, 50, 8);
    expect(series.bandEdgesHz).toHaveLength(9);
    expect(series.bandEdgesHz![0]).toBeGreaterThan(0);
    // Rising, and stopping at the Nyquist frequency.
    expect(series.bandEdgesHz![8]).toBeLessThanOrEqual(44100 / 2);
  });
});

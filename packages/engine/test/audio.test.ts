import { describe, expect, it } from "vitest";
import { analyzeAudio, audioFrameAt, fftInPlace, fftMagnitudes, SILENT_AUDIO_FRAME } from "../src/audio";

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

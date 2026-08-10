import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import type { AudioFrame } from "../src/audio";
import { VU_METER_TYPES, renderVuMeter, type VuMeterParams } from "../src/effects/vuMeter";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)];
const BASE: VuMeterParams = { type: "Spectrum", bars: 4, gainPct: 100, sensitivityPct: 50 };

function frame(level: number, bands: number[]): AudioFrame {
  return { level, bands };
}

function render(params: Partial<VuMeterParams>, audio: AudioFrame | undefined, w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderVuMeter(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1, audio });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

function columnHeight(buf: RenderBuffer, x: number): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("VU Meter effect (SPEC ch8)", () => {
  it("renders nothing when the sequence has no audio loaded", () => {
    for (const type of VU_METER_TYPES) {
      expect(litCount(render({ type }, undefined)), `${type} with no audio`).toBe(0);
    }
  });

  it("Spectrum draws each band at its own height", () => {
    const buf = render({ type: "Spectrum", bars: 4 }, frame(1, [1, 0.5, 0.25, 0]));
    expect(columnHeight(buf, 0)).toBe(16);
    expect(columnHeight(buf, 4)).toBe(8);
    expect(columnHeight(buf, 8)).toBe(4);
    expect(columnHeight(buf, 12)).toBe(0);
  });

  it("Volume Bars draws every bar at the overall level", () => {
    const buf = render({ type: "Volume Bars", bars: 4 }, frame(0.5, [1, 0, 0, 0]));
    expect(columnHeight(buf, 0)).toBe(8);
    expect(columnHeight(buf, 12)).toBe(8);
  });

  it("Level Bar fills the whole width to the level's height", () => {
    const buf = render({ type: "Level Bar" }, frame(0.25, []));
    expect(columnHeight(buf, 0)).toBe(4);
    expect(columnHeight(buf, 15)).toBe(4);
  });

  it("Level Pulse only fires above the sensitivity threshold", () => {
    expect(litCount(render({ type: "Level Pulse", sensitivityPct: 60 }, frame(0.3, [])))).toBe(0);
    expect(litCount(render({ type: "Level Pulse", sensitivityPct: 60 }, frame(0.9, [])))).toBe(16 * 16);
  });

  it("gain scales the analysed level", () => {
    const quiet = render({ type: "Level Bar", gainPct: 100 }, frame(0.25, []));
    const boosted = render({ type: "Level Bar", gainPct: 300 }, frame(0.25, []));
    expect(columnHeight(boosted, 0)).toBeGreaterThan(columnHeight(quiet, 0));
  });

  it("gain clamps at full scale rather than overflowing the buffer", () => {
    const buf = render({ type: "Level Bar", gainPct: 300 }, frame(1, []));
    expect(columnHeight(buf, 0)).toBe(16);
  });

  it("Level Color picks a colour from the palette by level", () => {
    const low = render({ type: "Level Color" }, frame(0.05, [])).getPixel(0, 0);
    const high = render({ type: "Level Color" }, frame(0.95, [])).getPixel(0, 0);
    expect(low).not.toEqual(high);
  });

  it("Intensity Wave brightness follows the level", () => {
    const brightest = (buf: RenderBuffer): number => {
      let max = 0;
      for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) max = Math.max(max, buf.getPixel(x, y).a);
      return max;
    };
    expect(brightest(render({ type: "Intensity Wave" }, frame(1, [])))).toBeGreaterThan(
      brightest(render({ type: "Intensity Wave" }, frame(0.2, []))),
    );
  });

  it("Waveform draws around the vertical centre rather than from the floor", () => {
    const buf = render({ type: "Waveform", bars: 4 }, frame(1, [1, 1, 1, 1]));
    expect(buf.getPixel(0, 7).a).toBeGreaterThan(0); // centred
    expect(buf.getPixel(0, 0).a).toBeGreaterThan(0); // reaches the edges at full level
    const quiet = render({ type: "Waveform", bars: 4 }, frame(0.1, [0.05, 0.05, 0.05, 0.05]));
    expect(quiet.getPixel(0, 0).a).toBe(0); // a quiet passage stays near the middle
    expect(quiet.getPixel(0, 7).a).toBeGreaterThan(0);
  });

  it("resamples the analysed bands onto whatever bar count is asked for", () => {
    expect(() => render({ type: "Spectrum", bars: 32 }, frame(1, [1, 0.5]))).not.toThrow();
    expect(litCount(render({ type: "Spectrum", bars: 32 }, frame(1, [1, 0.5])))).toBeGreaterThan(0);
  });
});

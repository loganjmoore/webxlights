import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderWave } from "../src/effects/wave";

describe("Wave effect (SPEC ch8, Sine type)", () => {
  it("draws a band around the sine curve at column x=0", () => {
    // numberOfWavesDeg small enough that degree at x=0 is 0 -> sin(0)=0 -> centered at yc
    const buf = new RenderBuffer(10, 10);
    renderWave(buf, [rgba(255, 0, 0)], { numberOfWavesDeg: 360, thicknessPct: 20, heightPct: 50, speed: 0, leftToRight: false }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    expect(buf.getPixel(0, 5).a).toBeGreaterThan(0); // yc=5, band centered there
  });

  it("thickness widens the lit band", () => {
    const countLit = (thicknessPct: number) => {
      const buf = new RenderBuffer(10, 20);
      renderWave(buf, [rgba(255, 0, 0)], { numberOfWavesDeg: 360, thicknessPct, heightPct: 50, speed: 0, leftToRight: false }, {
        frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
      });
      let n = 0;
      for (let y = 0; y < 20; y++) if (buf.getPixel(0, y).a > 0) n++;
      return n;
    };
    expect(countLit(50)).toBeGreaterThan(countLit(5));
  });

  it("is deterministic", () => {
    const params = { numberOfWavesDeg: 900, thicknessPct: 10, heightPct: 50, speed: 10, leftToRight: true };
    const a = new RenderBuffer(30, 20);
    const b = new RenderBuffer(30, 20);
    const ctx = { frameIndexInEffect: 4, positionInEffect01: 0.5, seed: 1 };
    renderWave(a, [rgba(255, 0, 0)], params, ctx);
    renderWave(b, [rgba(255, 0, 0)], params, ctx);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });
});

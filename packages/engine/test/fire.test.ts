import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { createFireState, renderFire } from "../src/effects/fire";

describe("Fire effect (SPEC ch7, Old Render Method)", () => {
  it("row 0 (the base) is always hot: LUT index 150-199 = red->yellow band", () => {
    const buf = new RenderBuffer(6, 8);
    const state = createFireState(6, 8, 42);
    renderFire(buf, { height: 50, hueShift: 0, growthCycles: 0 }, { frameIndexInEffect: 0, positionInEffect01: 0, seed: 42 }, state);
    const base = buf.getPixel(0, 0);
    // idx>=100 is hue-shifted red->yellow at full value: red channel should be high (>=200)
    expect(base.r).toBeGreaterThanOrEqual(200);
  });

  it("is deterministic given the same seed across two independent runs", () => {
    const bufA = new RenderBuffer(5, 6);
    const bufB = new RenderBuffer(5, 6);
    const stateA = createFireState(5, 6, 7);
    const stateB = createFireState(5, 6, 7);
    const params = { height: 50, hueShift: 0, growthCycles: 0 };
    for (let f = 0; f < 5; f++) {
      renderFire(bufA, params, { frameIndexInEffect: f, positionInEffect01: f / 10, seed: 7 }, stateA);
      renderFire(bufB, params, { frameIndexInEffect: f, positionInEffect01: f / 10, seed: 7 }, stateB);
    }
    for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) expect(bufA.getPixel(x, y)).toEqual(bufB.getPixel(x, y));
  });

  it("heat decays going up the buffer on average (fire shape, not a solid fill)", () => {
    const buf = new RenderBuffer(10, 20);
    const state = createFireState(10, 20, 3);
    const params = { height: 50, hueShift: 0, growthCycles: 0 };
    const last: RenderBuffer = buf;
    for (let f = 0; f < 10; f++) {
      renderFire(last, params, { frameIndexInEffect: f, positionInEffect01: f / 20, seed: 3 }, state);
    }
    const baseBrightness = last.getPixel(5, 0).r + last.getPixel(5, 0).g;
    const topBrightness = last.getPixel(5, 19).r + last.getPixel(5, 19).g;
    expect(baseBrightness).toBeGreaterThan(topBrightness);
  });
});

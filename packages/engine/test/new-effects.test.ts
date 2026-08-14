import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderOff } from "../src/effects/off";
import { renderShimmer } from "../src/effects/shimmer";
import { renderFill } from "../src/effects/fill";
import { createSnowStormState, renderSnowStorm } from "../src/effects/snowStorm";
import type { FrameContext } from "../src/effects/types";

const RED = rgba(255, 0, 0, 255);
const GREEN = rgba(0, 255, 0, 255);
const PALETTE = [RED, GREEN];

function ctx(position: number, frame = 0): FrameContext {
  return { frameIndexInEffect: frame, positionInEffect01: position, seed: 99 };
}

function lit(b: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Off", () => {
  it("turns every pixel off, opaquely by default", () => {
    const b = new RenderBuffer(4, 4);
    b.fill(RED);
    renderOff(b, { transparent: false });
    expect(b.getPixel(0, 0)).toEqual(rgba(0, 0, 0, 255));
  });

  it("leaves the layers below showing when Transparent is set", () => {
    // The manual's own use for this is with canvas-style blending: an opaque Off hides what is
    // under it, a transparent one gates it. Rendering nothing at all would only ever do the
    // second, and the first is the common case.
    const b = new RenderBuffer(4, 4);
    b.fill(RED);
    renderOff(b, { transparent: true });
    expect(b.getPixel(0, 0).a).toBe(0);
  });
});

describe("Shimmer", () => {
  const params = { dutyFactor: 50, cycleCount: 10, useAllColors: false };

  it("is on for the duty share of each cycle and off for the rest", () => {
    const on = new RenderBuffer(2, 2);
    renderShimmer(on, PALETTE, params, ctx(0.0));
    expect(lit(on)).toBe(4);

    const off = new RenderBuffer(2, 2);
    renderShimmer(off, PALETTE, params, ctx(0.07)); // past 50% of the first of ten cycles
    expect(lit(off)).toBe(0);
  });

  it("a lower duty factor means less on-time", () => {
    const b = new RenderBuffer(2, 2);
    renderShimmer(b, PALETTE, { ...params, dutyFactor: 10 }, ctx(0.03));
    expect(lit(b)).toBe(0); // still on at 50% duty, already off at 10%
  });

  it("steps through the palette per cycle only when Use All Colors is set", () => {
    const plain = new RenderBuffer(1, 1);
    renderShimmer(plain, PALETTE, params, ctx(0.1)); // second cycle
    expect(plain.getPixel(0, 0)).toMatchObject({ r: 255, g: 0 });

    const all = new RenderBuffer(1, 1);
    renderShimmer(all, PALETTE, { ...params, useAllColors: true }, ctx(0.1));
    expect(all.getPixel(0, 0)).toMatchObject({ r: 0, g: 255 });
  });
});

describe("Fill", () => {
  const base = { position: 100, bandSize: 0, skipSize: 0, offset: 0, changeColorOverTime: false, direction: "up" as const };

  it("fills the whole model at position 100", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, base, ctx(0));
    expect(lit(b)).toBe(12);
  });

  it("fills part-way at a lower position", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, { ...base, position: 50 }, ctx(0));
    expect(lit(b)).toBe(6);
    expect(b.getPixel(0, 0).a).toBe(255); // bottom, because "up" starts at the bottom
    expect(b.getPixel(0, 3).a).toBe(0);
  });

  it("fills from the opposite edge going down", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, { ...base, position: 50, direction: "down" }, ctx(0));
    expect(b.getPixel(0, 3).a).toBe(255);
    expect(b.getPixel(0, 0).a).toBe(0);
  });

  it("starts at the right edge for Left, which is what the manual says", () => {
    // "Left - starts at right and moves left", the opposite of what the word suggests alone.
    const b = new RenderBuffer(4, 1);
    renderFill(b, PALETTE, { ...base, position: 50, direction: "left" }, ctx(0));
    expect(b.getPixel(3, 0).a).toBe(255);
    expect(b.getPixel(0, 0).a).toBe(0);
  });

  it("cuts the fill into bands with a skip between them", () => {
    const b = new RenderBuffer(1, 8);
    renderFill(b, PALETTE, { ...base, bandSize: 2, skipSize: 2 }, ctx(0));
    expect(b.getPixel(0, 0).a).toBe(255);
    expect(b.getPixel(0, 1).a).toBe(255);
    expect(b.getPixel(0, 2).a).toBe(0);
    expect(b.getPixel(0, 3).a).toBe(0);
    expect(b.getPixel(0, 4).a).toBe(255);
  });

  it("walks the palette over the effect only when asked to", () => {
    const fixed = new RenderBuffer(1, 1);
    renderFill(fixed, PALETTE, base, ctx(0.9));
    expect(fixed.getPixel(0, 0)).toMatchObject({ r: 255, g: 0 });

    const changing = new RenderBuffer(1, 1);
    renderFill(changing, PALETTE, { ...base, changeColorOverTime: true }, ctx(0.9));
    expect(changing.getPixel(0, 0)).toMatchObject({ r: 0, g: 255 });
  });
});

describe("Snow Storm", () => {
  const params = { maxFlakes: 30, trailLength: 3, speed: 20 };

  it("puts particles on the buffer", () => {
    const b = new RenderBuffer(12, 12);
    const state = createSnowStormState(12, 12, params, 7);
    renderSnowStorm(b, PALETTE, params, state);
    expect(lit(b)).toBeGreaterThan(0);
  });

  it("moves them between frames", () => {
    const state = createSnowStormState(12, 12, params, 7);
    const before = state.particles.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|");
    renderSnowStorm(new RenderBuffer(12, 12), PALETTE, params, state);
    const after = state.particles.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|");
    expect(after).not.toBe(before);
  });

  it("keeps every particle inside the buffer, so the storm doesn't thin out", () => {
    const state = createSnowStormState(10, 10, params, 3);
    for (let f = 0; f < 60; f++) renderSnowStorm(new RenderBuffer(10, 10), PALETTE, params, state);
    for (const p of state.particles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(10);
    }
  });

  it("leaves a trail that fades behind each particle", () => {
    const state = createSnowStormState(20, 20, params, 5);
    for (let f = 0; f < 5; f++) renderSnowStorm(new RenderBuffer(20, 20), PALETTE, params, state);
    const alphas = new Set<number>();
    const b = new RenderBuffer(20, 20);
    renderSnowStorm(b, PALETTE, params, state);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const a = b.getPixel(x, y).a;
      if (a > 0) alphas.add(a);
    }
    expect(alphas.size).toBeGreaterThan(1); // head and trail are not the same brightness
  });

  it("is deterministic for a given seed", () => {
    const a = createSnowStormState(10, 10, params, 42);
    const b = createSnowStormState(10, 10, params, 42);
    expect(a.particles).toEqual(b.particles);
  });
});

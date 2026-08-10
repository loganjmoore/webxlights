import { describe, expect, it } from "vitest";
import { resolveParam, isValueCurve } from "../src/valueCurve";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderOn } from "../src/effects/on";

describe("Value curve mechanism (SPEC ch9)", () => {
  it("resolveParam passes a flat number through unchanged", () => {
    expect(resolveParam(42, 0.5)).toBe(42);
  });

  it("resolveParam linearly interpolates a Ramp curve by position", () => {
    expect(resolveParam({ type: "Ramp", min: 0, max: 100 }, 0)).toBe(0);
    expect(resolveParam({ type: "Ramp", min: 0, max: 100 }, 0.5)).toBe(50);
    expect(resolveParam({ type: "Ramp", min: 0, max: 100 }, 1)).toBe(100);
  });

  it("isValueCurve distinguishes a curve object from a plain number", () => {
    expect(isValueCurve(5)).toBe(false);
    expect(isValueCurve({ type: "Ramp", min: 0, max: 1 })).toBe(true);
  });

  it("On effect's transparencyPct accepts a Ramp value curve and animates over the effect", () => {
    const params = { startIntensity: 100, endIntensity: 100, transparencyPct: { type: "Ramp" as const, min: 0, max: 100 }, cycles: 1, shimmer: false };
    const early = new RenderBuffer(1, 1);
    renderOn(early, [rgba(255, 0, 0)], params, { frameIndexInEffect: 0, positionInEffect01: 0 });
    const late = new RenderBuffer(1, 1);
    renderOn(late, [rgba(255, 0, 0)], params, { frameIndexInEffect: 0, positionInEffect01: 1 });
    // transparency ramps 0->100, so alpha ramps 255->0 (fades out over the effect)
    expect(early.getPixel(0, 0).a).toBeGreaterThan(late.getPixel(0, 0).a);
  });
});

import { describe, expect, it } from "vitest";
import { groundedAnchorY, MIN_SCALE, RESIZE_DAMPING, resizeFromCorner } from "../src/lib/resizeModel";

const base = {
  unitHalfWidth: 10,
  unitHalfHeight: 20,
  unitsPerLocal: 4,
  startScale: 1,
  startScaleZ: 1,
  uniform: false,
};

describe("resizing a model by a corner grip", () => {
  it("turns a pointer distance into the scale that puts the edge there", () => {
    // half-width 10 local x 4 units per local = 40 world at scale 1, so 80 world is scale 2
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 160 });
    expect(r.scale).toBeCloseTo(2, 6);
    expect(r.scaleY).toBeCloseTo(2, 6);
  });

  it("moves X and Y independently when it isn't uniform", () => {
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 80 });
    expect(r.scale).toBeCloseTo(2, 6);
    expect(r.scaleY).toBeCloseTo(1, 6);
  });

  it("carries depth along with width, so a wider prop doesn't stay the old depth", () => {
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 40, startScaleZ: 3 });
    expect(r.scale).toBeCloseTo(2, 6);
    expect(r.scaleZ).toBeCloseTo(6, 6); // 3 x the same doubling
  });

  it("moves all three together when uniform - the tree case", () => {
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 40, uniform: true });
    expect(r.scale).toBeCloseTo(2, 6);
    expect(r.scaleY).toBeCloseTo(2, 6);
    expect(r.scaleZ).toBeCloseTo(2, 6);
  });

  it("follows the axis that moved furthest when uniform", () => {
    // Y barely moved, X doubled: the prop should double rather than splitting the difference,
    // or the grip visibly lags behind the pointer.
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 81, uniform: true });
    expect(r.scale).toBeCloseTo(2, 6);
  });

  it("never collapses to a scale of zero, which would leave no corner to drag back out", () => {
    const r = resizeFromCorner({ ...base, halfWidthWorld: 0, halfHeightWorld: 0 });
    expect(r.scale).toBe(MIN_SCALE);
    expect(r.scaleY).toBe(MIN_SCALE);
    expect(r.scale).toBeGreaterThan(0);
  });

  it("plants a resized model back on the ground", () => {
    // Growing about the centre drops the base by half the added height; the anchor goes up by
    // the new half-height so the feet stay on the lawn.
    expect(groundedAnchorY(0, 160)).toBe(160);
    expect(groundedAnchorY(-40, 160)).toBe(120);
  });

  it("grows relative to where the grip was grabbed, and more slowly than the hand moves", () => {
    // Grabbed 40 out; pointer now 80 out: twice the distance. Damped, that is 2^0.6 = 1.52x.
    const r = resizeFromCorner({ ...base, halfWidthWorld: 80, halfHeightWorld: 160, grabHalfWidthWorld: 40, grabHalfHeightWorld: 80 });
    expect(r.scale).toBeCloseTo(Math.pow(2, RESIZE_DAMPING), 6);
    expect(r.scaleY).toBeCloseTo(Math.pow(2, RESIZE_DAMPING), 6);
    // The grip being a long way out on a tiny prop no longer matters: no movement, no change.
    const still = resizeFromCorner({ ...base, halfWidthWorld: 40, halfHeightWorld: 80, grabHalfWidthWorld: 40, grabHalfHeightWorld: 80, startScale: 0.05, startScaleY: 0.05 });
    expect(still.scale).toBeCloseTo(0.05, 6);
    expect(still.scaleY).toBeCloseTo(0.05, 6);
  });
});

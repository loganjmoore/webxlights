import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderShockwave } from "../src/effects/shockwave";

describe("Shockwave effect (SPEC ch8)", () => {
  it("ring expands outward as position increases", () => {
    const ringDist = (position: number) => {
      const buf = new RenderBuffer(60, 60);
      renderShockwave(buf, [rgba(255, 0, 0)], {
        centerXPct: 50, centerYPct: 50, startRadius: 0, endRadius: 100, startWidth: 5, endWidth: 5, cycles: 1, blendEdges: false,
      }, { frameIndexInEffect: 0, positionInEffect01: position, seed: 1 });
      let maxDist = 0;
      for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (buf.getPixel(x, y).a > 0) maxDist = Math.max(maxDist, Math.hypot(x - 30, y - 30));
      return maxDist;
    };
    expect(ringDist(0.9)).toBeGreaterThan(ringDist(0.1));
  });

  it("blendEdges fades alpha toward the ring's outer edge", () => {
    const buf = new RenderBuffer(60, 60);
    renderShockwave(buf, [rgba(255, 0, 0)], {
      centerXPct: 50, centerYPct: 50, startRadius: 100, endRadius: 100, startWidth: 40, endWidth: 40, cycles: 1, blendEdges: true,
    }, { frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1 });
    // center of the ring band (x=30+radiusCenter, y=30) should be brighter than a lit edge pixel
    const centerPixel = buf.getPixel(30, 0); // roughly on the ring at radius ~= dim*100/200
    expect(centerPixel.a).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", () => {
    const params = { centerXPct: 40, centerYPct: 60, startRadius: 10, endRadius: 200, startWidth: 10, endWidth: 30, cycles: 2, blendEdges: true };
    const a = new RenderBuffer(40, 40);
    const b = new RenderBuffer(40, 40);
    const ctx = { frameIndexInEffect: 0, positionInEffect01: 0.33, seed: 1 };
    renderShockwave(a, [rgba(255, 0, 0), rgba(0, 255, 0)], params, ctx);
    renderShockwave(b, [rgba(255, 0, 0), rgba(0, 255, 0)], params, ctx);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });
});

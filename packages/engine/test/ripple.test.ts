import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderRipple } from "../src/effects/ripple";

describe("Ripple effect (SPEC ch8, Old/Circle)", () => {
  it("explode grows radius with position (more spread-out ring at higher position)", () => {
    const litRadius = (position: number) => {
      const buf = new RenderBuffer(40, 40);
      renderRipple(buf, [rgba(255, 0, 0)], { movement: "explode", cycles: 1, thickness: 1 }, {
        frameIndexInEffect: 0, positionInEffect01: position, seed: 1,
      });
      let maxDist = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (buf.getPixel(x, y).a > 0) maxDist = Math.max(maxDist, Math.hypot(x - 20, y - 20));
        }
      }
      return maxDist;
    };
    expect(litRadius(0.8)).toBeGreaterThan(litRadius(0.2));
  });

  it("implode shrinks radius with position (opposite of explode)", () => {
    const buf1 = new RenderBuffer(40, 40);
    renderRipple(buf1, [rgba(255, 0, 0)], { movement: "implode", cycles: 1, thickness: 1 }, {
      frameIndexInEffect: 0, positionInEffect01: 0.2, seed: 1,
    });
    const buf2 = new RenderBuffer(40, 40);
    renderRipple(buf2, [rgba(255, 0, 0)], { movement: "implode", cycles: 1, thickness: 1 }, {
      frameIndexInEffect: 0, positionInEffect01: 0.8, seed: 1,
    });
    const dist = (buf: RenderBuffer) => {
      let maxDist = 0;
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (buf.getPixel(x, y).a > 0) maxDist = Math.max(maxDist, Math.hypot(x - 20, y - 20));
      return maxDist;
    };
    expect(dist(buf1)).toBeGreaterThan(dist(buf2));
  });

  it("is deterministic", () => {
    const a = new RenderBuffer(20, 20);
    const b = new RenderBuffer(20, 20);
    const params = { movement: "explode" as const, cycles: 2, thickness: 3 };
    const ctx = { frameIndexInEffect: 0, positionInEffect01: 0.45, seed: 1 };
    renderRipple(a, [rgba(255, 0, 0), rgba(0, 0, 255)], params, ctx);
    renderRipple(b, [rgba(255, 0, 0), rgba(0, 0, 255)], params, ctx);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });
});

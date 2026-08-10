import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderPinwheel } from "../src/effects/pinwheel";

describe("Pinwheel effect (SPEC ch8, New Render Method)", () => {
  it("center pixel is never lit (r<=0 guard)", () => {
    const buf = new RenderBuffer(21, 21); // odd size so (10,10) is the exact center
    renderPinwheel(buf, [rgba(255, 0, 0)], { arms: 3, armSizePct: 100, thicknessPct: 50, speed: 0, counterClockwise: true }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    expect(buf.getPixel(10, 10).a).toBe(0);
  });

  it("higher thicknessPct lights more of the buffer at a fixed arm count", () => {
    // total lit angle = thicknessPct/100 * 360, independent of arm count - so vary
    // thickness, not arms, to observe more coverage.
    const countLit = (thicknessPct: number) => {
      const buf = new RenderBuffer(30, 30);
      renderPinwheel(buf, [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)], { arms: 4, armSizePct: 100, thicknessPct, speed: 0, counterClockwise: true }, {
        frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
      });
      let n = 0;
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (buf.getPixel(x, y).a > 0) n++;
      return n;
    };
    expect(countLit(80)).toBeGreaterThan(countLit(10));
  });

  it("is deterministic", () => {
    const params = { arms: 4, armSizePct: 100, thicknessPct: 30, speed: 15, counterClockwise: false };
    const a = new RenderBuffer(25, 25);
    const b = new RenderBuffer(25, 25);
    const ctx = { frameIndexInEffect: 6, positionInEffect01: 0, seed: 1 };
    renderPinwheel(a, [rgba(255, 0, 0), rgba(0, 0, 255)], params, ctx);
    renderPinwheel(b, [rgba(255, 0, 0), rgba(0, 0, 255)], params, ctx);
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });
});

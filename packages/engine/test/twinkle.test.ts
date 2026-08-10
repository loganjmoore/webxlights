import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderTwinkle } from "../src/effects/twinkle";

describe("Twinkle effect (SPEC ch8, Old Render Method)", () => {
  it("brightness follows a triangle wave over one full cycle (steps)", () => {
    const params = { countPct: 100, steps: 10 }; // maxModulo=10, maxModulo2=5
    const buf = new RenderBuffer(4, 4);
    // frame 0: duration=durationInit (unknown per-light) - instead check a light's own duration
    // deterministically across frames covering a full cycle for 100% count (all cells are lights)
    let sawRising = false;
    let sawFalling = false;
    let prevAlpha = -1;
    for (let f = 0; f < 10; f++) {
      renderTwinkle(buf, [rgba(255, 255, 255)], params, { frameIndexInEffect: f, positionInEffect01: 0, seed: 1 });
      const a = buf.getPixel(0, 0).a;
      if (prevAlpha >= 0) {
        if (a > prevAlpha) sawRising = true;
        if (a < prevAlpha) sawFalling = true;
      }
      prevAlpha = a;
    }
    expect(sawRising).toBe(true);
    expect(sawFalling).toBe(true);
  });

  it("is deterministic given the same seed", () => {
    const params = { countPct: 40, steps: 20 };
    const ctx = { frameIndexInEffect: 7, positionInEffect01: 0, seed: 55 };
    const a = new RenderBuffer(8, 8);
    const b = new RenderBuffer(8, 8);
    renderTwinkle(a, [rgba(255, 0, 0), rgba(0, 255, 0)], params, ctx);
    renderTwinkle(b, [rgba(255, 0, 0), rgba(0, 255, 0)], params, ctx);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });

  it("fewer lights are active at low countPct than at 100%", () => {
    const countLit = (countPct: number) => {
      const buf = new RenderBuffer(10, 10);
      renderTwinkle(buf, [rgba(255, 255, 255)], { countPct, steps: 30 }, { frameIndexInEffect: 5, positionInEffect01: 0, seed: 1 });
      let n = 0;
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (buf.getPixel(x, y).a > 0) n++;
      return n;
    };
    expect(countLit(100)).toBeGreaterThan(countLit(5));
  });
});

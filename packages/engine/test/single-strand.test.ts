import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderSingleStrandChase } from "../src/effects/singleStrand";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("SingleStrand Chase effect (SPEC ch8, single chase, Left-Right, Palette)", () => {
  it("at position 0, the chase head sits at the strand's start", () => {
    // width=10, chaseSize=30% -> scw=3; rtval=0 -> startState=1, x0=1-3=-2
    const buf = new RenderBuffer(10, 1);
    renderSingleStrandChase(buf, [RED], { chaseSizePct: 30, cycles: 1, offsetPct: 0 }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    // some pixels should be lit (wrapped from negative x0), not an all-dark buffer
    let anyLit = false;
    for (let x = 0; x < 10; x++) if (buf.getPixel(x, 0).a > 0) anyLit = true;
    expect(anyLit).toBe(true);
  });

  it("is deterministic", () => {
    const params = { chaseSizePct: 20, cycles: 2, offsetPct: 10 };
    const ctx = { frameIndexInEffect: 0, positionInEffect01: 0.6, seed: 1 };
    const a = new RenderBuffer(16, 1);
    const b = new RenderBuffer(16, 1);
    renderSingleStrandChase(a, [RED, BLUE], params, ctx);
    renderSingleStrandChase(b, [RED, BLUE], params, ctx);
    for (let x = 0; x < 16; x++) expect(a.getPixel(x, 0)).toEqual(b.getPixel(x, 0));
  });

  it("chase width scales with chaseSizePct", () => {
    const countLit = (chaseSizePct: number) => {
      const buf = new RenderBuffer(20, 1);
      renderSingleStrandChase(buf, [RED], { chaseSizePct, cycles: 1, offsetPct: 0 }, {
        frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1,
      });
      let n = 0;
      for (let x = 0; x < 20; x++) if (buf.getPixel(x, 0).a > 0) n++;
      return n;
    };
    expect(countLit(80)).toBeGreaterThan(countLit(10));
  });
});

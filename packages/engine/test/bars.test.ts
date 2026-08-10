import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderBars } from "../src/effects/bars";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("Bars effect (SPEC ch7)", () => {
  it("down direction: barHt rows of each color from the top, cycling", () => {
    // H=4, 2 colors, paletteRep=1 -> barCount=2, barHt=ceil(4/2)=2, blockHt=4
    const buf = new RenderBuffer(1, 4);
    renderBars(buf, [RED, BLUE], { paletteRep: 1, cycles: 1, direction: "down", centerPercent: 0, highlight: false }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0,
      seed: 1,
    });
    // position=0 -> fOffset=0; n = H+y+0 = 4+y; y in [-8,8)
    // for y=0: n=4, blockHt=4, n%4=0, colorIdx=0/2=0 -> RED at row 0
    // for y=1: n=5, n%4=1, colorIdx=0 -> RED at row 1
    // for y=2: n=6, n%4=2, colorIdx=2/2=1 -> BLUE at row 2
    // for y=3: n=7, n%4=3, colorIdx=1 -> BLUE at row 3
    expect(buf.getPixel(0, 0)).toEqual(RED);
    expect(buf.getPixel(0, 1)).toEqual(RED);
    expect(buf.getPixel(0, 2)).toEqual(BLUE);
    expect(buf.getPixel(0, 3)).toEqual(BLUE);
  });

  it("is deterministic", () => {
    const params = { paletteRep: 1, cycles: 2, direction: "up" as const, centerPercent: 0, highlight: false };
    const ctx = { frameIndexInEffect: 3, positionInEffect01: 0.37, seed: 1 };
    const a = new RenderBuffer(8, 6);
    const b = new RenderBuffer(8, 6);
    renderBars(a, [RED, BLUE], params, ctx);
    renderBars(b, [RED, BLUE], params, ctx);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });

  it("left direction paints full columns", () => {
    const buf = new RenderBuffer(4, 1);
    renderBars(buf, [RED], { paletteRep: 1, cycles: 1, direction: "left", centerPercent: 0, highlight: false }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0,
      seed: 1,
    });
    expect(buf.getPixel(0, 0)).toEqual(RED);
  });
});

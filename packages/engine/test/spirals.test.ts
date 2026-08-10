import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderSpirals } from "../src/effects/spirals";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("Spirals effect (SPEC ch8)", () => {
  it("arm count = palette colors x paletteRep, each arm colored by its palette index", () => {
    // 2 colors x paletteRep=1 -> 2 arms; no rotation (spiralWraps=0), no movement -> vertical bars
    const buf = new RenderBuffer(10, 4);
    renderSpirals(buf, [RED, BLUE], { paletteRep: 1, spiralWraps: 0, thicknessPct: 50, movement: 0, blend: false }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    // deltaStrands = 10/2 = 5; arm 0 at strandBase=0 -> columns near x=0 are RED
    expect(buf.getPixel(0, 0)).toEqual(RED);
    // arm 1 at strandBase=5 -> columns near x=5 are BLUE
    expect(buf.getPixel(5, 0)).toEqual(BLUE);
  });

  it("is deterministic", () => {
    const params = { paletteRep: 2, spiralWraps: 3, thicknessPct: 40, movement: 2, blend: false };
    const ctx = { frameIndexInEffect: 5, positionInEffect01: 0.3, seed: 1 };
    const a = new RenderBuffer(16, 10);
    const b = new RenderBuffer(16, 10);
    renderSpirals(a, [RED, BLUE], params, ctx);
    renderSpirals(b, [RED, BLUE], params, ctx);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });

  it("blend mode varies color by row instead of a flat arm color", () => {
    const buf = new RenderBuffer(10, 6);
    renderSpirals(buf, [RED, BLUE], { paletteRep: 1, spiralWraps: 0, thicknessPct: 100, movement: 0, blend: true }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    const top = buf.getPixel(0, 0);
    const bottom = buf.getPixel(0, 5);
    expect(top).not.toEqual(bottom);
  });
});

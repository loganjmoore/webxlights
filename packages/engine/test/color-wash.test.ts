import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderColorWash } from "../src/effects/colorWash";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("ColorWash effect (SPEC ch7)", () => {
  it("solid fill at position 0 uses palette[0]", () => {
    const buf = new RenderBuffer(3, 3);
    renderColorWash(buf, [RED, BLUE], {
      cycles: 1, verticalFade: false, horizontalFade: false, reverseFades: false, shimmer: false, circularPalette: false,
    }, { frameIndexInEffect: 0, positionInEffect01: 0, seed: 1 });
    expect(buf.getPixel(1, 1)).toEqual(RED);
  });

  it("halfway through one cycle blends 50% toward the next palette color", () => {
    const buf = new RenderBuffer(1, 1);
    renderColorWash(buf, [RED, BLUE], {
      cycles: 1, verticalFade: false, horizontalFade: false, reverseFades: false, shimmer: false, circularPalette: false,
    }, { frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1 });
    // 2 colors, non-circular -> 1 segment; t=0.5 -> 50% red/blue blend
    expect(buf.getPixel(0, 0)).toEqual(rgba(128, 0, 128, 255));
  });

  it("shimmer writes transparent black on odd frames", () => {
    const buf = new RenderBuffer(2, 2);
    renderColorWash(buf, [RED], {
      cycles: 1, verticalFade: false, horizontalFade: false, reverseFades: false, shimmer: true, circularPalette: false,
    }, { frameIndexInEffect: 1, positionInEffect01: 0, seed: 1 });
    expect(buf.getPixel(0, 0)).toEqual(rgba(0, 0, 0, 0));
  });

  it("horizontal fade dims toward the edges (bright center, default)", () => {
    const buf = new RenderBuffer(5, 1);
    renderColorWash(buf, [RED], {
      cycles: 1, verticalFade: false, horizontalFade: true, reverseFades: false, shimmer: false, circularPalette: false,
    }, { frameIndexInEffect: 0, positionInEffect01: 0, seed: 1 });
    const center = buf.getPixel(2, 0);
    const edge = buf.getPixel(0, 0);
    expect(center.r).toBeGreaterThan(edge.r);
  });
});

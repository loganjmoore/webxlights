import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { renderOn } from "../src/effects/on";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("Matrix geometry (Vertical, Top Left, zigzag)", () => {
  it("wires even strings top-to-bottom and odd strings bottom-to-top", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 2, nodesPerString: 3 });
    expect(geo.width).toBe(2);
    expect(geo.height).toBe(3);
    // string 0 (even): n0 top (bufY=2) -> n2 bottom (bufY=0)
    expect(geo.nodes.slice(0, 3).map((n) => n.bufY)).toEqual([2, 1, 0]);
    // string 1 (odd): n0 bottom (bufY=0) -> n2 top (bufY=2)
    expect(geo.nodes.slice(3, 6).map((n) => n.bufY)).toEqual([0, 1, 2]);
  });
});

describe("On effect golden frames (10x5 buffer, SPEC ch8)", () => {
  it("solid fill at start=end=100 uses palette color unmodified", () => {
    const buf = new RenderBuffer(10, 5);
    renderOn(buf, [RED], { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.3,
    });
    expect(buf.getPixel(0, 0)).toEqual(RED);
    expect(buf.getPixel(9, 4)).toEqual(RED);
  });

  it("ramps HSV value linearly from start to end", () => {
    const buf = new RenderBuffer(10, 5);
    renderOn(buf, [RED], { startIntensity: 0, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
    });
    // adjust=0.5 -> d=0.5 -> V=0.5 -> hsvToRgb(0,1,0.5) = (128,0,0)
    expect(buf.getPixel(0, 0)).toEqual(rgba(128, 0, 0, 255));
  });

  it("shimmer alternates palette color 0/1 by frame parity", () => {
    const even = new RenderBuffer(10, 5);
    renderOn(even, [RED, BLUE], { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: true }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0,
    });
    expect(even.getPixel(0, 0)).toEqual(RED);

    const odd = new RenderBuffer(10, 5);
    renderOn(odd, [RED, BLUE], { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: true }, {
      frameIndexInEffect: 1,
      positionInEffect01: 0,
    });
    expect(odd.getPixel(0, 0)).toEqual(BLUE);
  });

  it("is deterministic: same inputs produce identical frames", () => {
    const a = new RenderBuffer(10, 5);
    const b = new RenderBuffer(10, 5);
    const params = { startIntensity: 20, endIntensity: 80, transparencyPct: 10, cycles: 2, shimmer: false } as const;
    const ctx = { frameIndexInEffect: 5, positionInEffect01: 0.73 };
    renderOn(a, [RED], params, ctx);
    renderOn(b, [RED], params, ctx);
    expect(a.getPixel(3, 2)).toEqual(b.getPixel(3, 2));
  });
});

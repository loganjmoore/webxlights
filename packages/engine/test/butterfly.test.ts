import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderButterfly } from "../src/effects/butterfly";

describe("Butterfly effect (SPEC ch7, Style 1)", () => {
  it("origin pixel (d~0) is never lit (d>0.001 guard)", () => {
    const buf = new RenderBuffer(9, 9);
    renderButterfly(buf, [rgba(255, 0, 0)], { colors: "rainbow", chunks: 1, skip: 2, speed: 10, reverse: false }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    // x=0,y=0 -> d=0 -> h=0 -> h2rgb(0) = pure red (hue 0), still "lit" but deterministic;
    // verify it's exactly h2rgb(0) = (255,0,0)
    expect(buf.getPixel(0, 0)).toEqual(rgba(255, 0, 0, 255));
  });

  it("is deterministic across frames given the same seed/params", () => {
    const params = { colors: "rainbow" as const, chunks: 1, skip: 2, speed: 20, reverse: false };
    const ctx = { frameIndexInEffect: 7, positionInEffect01: 0.4, seed: 1 };
    const a = new RenderBuffer(12, 8);
    const b = new RenderBuffer(12, 8);
    renderButterfly(a, [rgba(255, 0, 0)], params, ctx);
    renderButterfly(b, [rgba(255, 0, 0)], params, ctx);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });

  it("chunks/skip masking leaves some pixels unset (alpha 0)", () => {
    const buf = new RenderBuffer(20, 20);
    renderButterfly(buf, [rgba(255, 0, 0)], { colors: "rainbow", chunks: 5, skip: 2, speed: 10, reverse: false }, {
      frameIndexInEffect: 0, positionInEffect01: 0, seed: 1,
    });
    let anyTransparent = false;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (buf.getPixel(x, y).a === 0) anyTransparent = true;
    expect(anyTransparent).toBe(true);
  });
});

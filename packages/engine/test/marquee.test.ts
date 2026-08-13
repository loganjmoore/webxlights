import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { perimeterPosition, renderMarquee, type MarqueeParams } from "../src/effects/marquee";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)];
const BASE: MarqueeParams = { bandCount: 3, bandSize: 4, skipSize: 2, thickness: 1, stagger: 0, speed: 10, reverse: false };

function render(params: Partial<MarqueeParams>, position01: number, w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderMarquee(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 2 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Marquee effect (SPEC ch8)", () => {
  it("walks the perimeter once around a ring, and rejects interior pixels", () => {
    // 4x4 buffer, ring 0: perimeter is 12 pixels (2*(w+h) with w=h=3)
    expect(perimeterPosition(0, 0, 4, 4, 0)).toBe(0);
    expect(perimeterPosition(3, 0, 4, 4, 0)).toBe(3);
    expect(perimeterPosition(3, 3, 4, 4, 0)).toBe(6);
    expect(perimeterPosition(0, 3, 4, 4, 0)).toBe(9);
    expect(perimeterPosition(1, 1, 4, 4, 0)).toBe(-1); // interior
  });

  it("only lights the border at thickness 1", () => {
    const buf = render({ bandSize: 50, skipSize: 0 }, 0);
    expect(buf.getPixel(8, 8).a).toBe(0); // centre stays dark
    expect(litCount(buf)).toBe(60); // 16x16 border = 4*16 - 4
  });

  it("thickness draws additional rings inward", () => {
    const thin = litCount(render({ thickness: 1, bandSize: 50, skipSize: 0 }, 0));
    const thick = litCount(render({ thickness: 3, bandSize: 50, skipSize: 0 }, 0));
    expect(thick).toBeGreaterThan(thin);
  });

  it("skip size leaves gaps between the colour bands", () => {
    const gapless = litCount(render({ bandSize: 4, skipSize: 0 }, 0));
    const gapped = litCount(render({ bandSize: 4, skipSize: 4 }, 0));
    expect(gapped).toBeLessThan(gapless);
  });

  it("the bands chase around the ring over time", () => {
    const start = render({}, 0);
    const later = render({}, 0.5);
    let differences = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (start.getPixel(x, y).a !== later.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("uses more than one palette colour when several bands are configured", () => {
    const buf = render({ bandCount: 3, bandSize: 3, skipSize: 1 }, 0);
    const seen = new Set<string>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = buf.getPixel(x, y);
        if (c.a > 0) seen.add(`${c.r},${c.g},${c.b}`);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("Reverse chases the other way round the ring", () => {
    const forward = render({}, 0.3);
    const backward = render({ reverse: true }, 0.3);
    // compare colour, not just lit/unlit: a chase reversed can land on the same band *phase*
    // at a given instant while running the palette through those bands in the opposite order
    let differences = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const f = forward.getPixel(x, y);
        const b = backward.getPixel(x, y);
        if (f.r !== b.r || f.g !== b.g || f.b !== b.b || f.a !== b.a) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});

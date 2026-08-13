import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { GLYPH_HEIGHT, glyphPixel, measureText } from "../src/effects/font5x7";
import { renderText, type TextParams } from "../src/effects/text";

const PALETTE = [rgba(255, 0, 0), rgba(0, 0, 255)];
const BASE: TextParams = {
  text: "A",
  scale: 1,
  movement: "none",
  speed: 1,
  xOffsetPct: 0,
  yOffsetPct: 0,
  perCharacterColor: false,
};

function render(params: Partial<TextParams>, position01: number, w = 32, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderText(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 1 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Text effect (SPEC ch8)", () => {
  it("the 5x7 font has a glyph for every printable ASCII character", () => {
    for (let code = 0x20; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      let painted = 0;
      for (let c = 0; c < 5; c++) for (let r = 0; r < GLYPH_HEIGHT; r++) if (glyphPixel(ch, c, r)) painted++;
      if (ch === " ") expect(painted, "space is blank").toBe(0);
      else expect(painted, `glyph for "${ch}" is blank`).toBeGreaterThan(0);
    }
  });

  it("an unmapped character falls back to a visible box rather than vanishing", () => {
    let painted = 0;
    for (let c = 0; c < 5; c++) for (let r = 0; r < GLYPH_HEIGHT; r++) if (glyphPixel("é", c, r)) painted++;
    expect(painted).toBeGreaterThan(0);
  });

  it("measureText accounts for the inter-character gap", () => {
    expect(measureText("A")).toEqual({ width: 5, height: 7 });
    expect(measureText("AB")).toEqual({ width: 11, height: 7 });
    expect(measureText("")).toEqual({ width: 0, height: 7 });
  });

  it("renders 'A' the right way up (buffer origin is bottom-left)", () => {
    const buf = render({ text: "A" }, 0, 5, 7);
    // 'A' has a solid bottom row of stems and a crossbar, and a gap in the middle of its top row
    expect(buf.getPixel(0, 0).a).toBeGreaterThan(0); // bottom-left stem
    expect(buf.getPixel(4, 0).a).toBeGreaterThan(0); // bottom-right stem
    expect(buf.getPixel(0, 6).a).toBe(0); // top-left is the shoulder, not painted
    expect(buf.getPixel(2, 6).a).toBeGreaterThan(0); // apex is painted
  });

  it("draws nothing for empty text", () => {
    expect(litCount(render({ text: "" }, 0))).toBe(0);
  });

  it("scale multiplies the glyph size", () => {
    const small = litCount(render({ text: "W", scale: 1 }, 0));
    const large = litCount(render({ text: "W", scale: 2 }, 0));
    expect(large).toBe(small * 4); // 2x in both axes
  });

  it("scrolls left over the effect", () => {
    const positions: number[] = [];
    for (const p of [0.05, 0.25, 0.45]) {
      const buf = render({ text: "HI", movement: "left", speed: 1 }, p);
      let leftmost = -1;
      for (let x = 0; x < 32 && leftmost === -1; x++) {
        for (let y = 0; y < 16; y++) if (buf.getPixel(x, y).a > 0) leftmost = x;
      }
      positions.push(leftmost);
    }
    expect(positions[0]).toBeGreaterThan(positions[2]!); // text moves toward x=0
  });

  it("vertical scrolling moves along y instead of x", () => {
    const a = render({ text: "HI", movement: "up", speed: 1 }, 0.1);
    const b = render({ text: "HI", movement: "up", speed: 1 }, 0.4);
    let differences = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (a.getPixel(x, y).a !== b.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("colour per character steps through the palette", () => {
    const buf = render({ text: "AB", perCharacterColor: true }, 0);
    const seen = new Set<string>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 32; x++) {
        const c = buf.getPixel(x, y);
        if (c.a > 0) seen.add(`${c.r},${c.g},${c.b}`);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("text wider than the buffer is clipped, not wrapped or crashed", () => {
    expect(() => render({ text: "A VERY LONG STRING OF TEXT INDEED" }, 0.5, 8, 8)).not.toThrow();
  });
});

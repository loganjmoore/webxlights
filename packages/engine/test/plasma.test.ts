import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderPlasma, type PlasmaParams } from "../src/effects/plasma";

const PALETTE = [rgba(255, 0, 0), rgba(0, 0, 255)];
const BASE: PlasmaParams = { style: 1, lineDensity: 3, speed: 10, colors: "rainbow" };

function render(params: Partial<PlasmaParams>, position01: number, w = 12, h = 12): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderPlasma(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 7 });
  return buf;
}

function distinctColors(buf: RenderBuffer): number {
  const seen = new Set<string>();
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const c = buf.getPixel(x, y);
      seen.add(`${c.r},${c.g},${c.b}`);
    }
  }
  return seen.size;
}

describe("Plasma effect (SPEC ch8)", () => {
  it("fills every pixel — plasma is a full-buffer field, not a sprite", () => {
    const buf = render({}, 0.3);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(buf.getPixel(x, y).a).toBe(255);
  });

  it("produces a varied field rather than a flat colour", () => {
    expect(distinctColors(render({}, 0.3))).toBeGreaterThan(5);
  });

  it("animates: the field differs between two positions in the effect", () => {
    const early = render({}, 0);
    const late = render({}, 0.5);
    let differences = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (early.getPixel(x, y).r !== late.getPixel(x, y).r) differences++;
    expect(differences).toBeGreaterThan(10);
  });

  it("all four styles render a full field", () => {
    for (const style of [1, 2, 3, 4]) {
      const buf = render({ style }, 0.4);
      expect(buf.getPixel(0, 0).a, `style ${style}`).toBe(255);
      expect(distinctColors(buf), `style ${style}`).toBeGreaterThan(2);
    }
  });

  it("higher line density puts more variation into the same buffer", () => {
    expect(distinctColors(render({ lineDensity: 9 }, 0.2))).toBeGreaterThanOrEqual(distinctColors(render({ lineDensity: 1 }, 0.2)));
  });

  it("palette mode stays within the palette's colour range", () => {
    const buf = render({ colors: "palette" }, 0.5);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const c = buf.getPixel(x, y);
        expect(c.g).toBe(0); // the palette is red->blue, so green never appears
      }
    }
  });

  it("is deterministic for the same inputs", () => {
    const a = render({ style: 3 }, 0.65);
    const b = render({ style: 3 }, 0.65);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });
});

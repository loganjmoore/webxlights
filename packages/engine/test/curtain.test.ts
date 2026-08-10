import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderCurtain, type CurtainParams } from "../src/effects/curtain";

const PALETTE = [rgba(255, 0, 0), rgba(0, 0, 255)];
const BASE: CurtainParams = { edge: "center", movement: "open", swagPct: 0, repeat: 1, speed: 0 };

function render(params: Partial<CurtainParams>, position01: number, w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderCurtain(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 1 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Curtain effect (SPEC ch8)", () => {
  it("Open starts fully covered and ends fully open", () => {
    expect(litCount(render({ movement: "open" }, 0))).toBe(16 * 16);
    expect(litCount(render({ movement: "open" }, 1))).toBe(0);
  });

  it("Close runs the other way", () => {
    expect(litCount(render({ movement: "close" }, 0))).toBe(0);
    expect(litCount(render({ movement: "close" }, 1))).toBe(16 * 16);
  });

  it("Open then close returns to covered by the end", () => {
    expect(litCount(render({ movement: "open then close" }, 0.5))).toBe(0);
    expect(litCount(render({ movement: "open then close" }, 1))).toBe(16 * 16);
  });

  it("the centre edge opens from the middle outward", () => {
    const buf = render({ edge: "center", movement: "open" }, 0.5);
    expect(buf.getPixel(8, 8).a).toBe(0); // middle has opened
    expect(buf.getPixel(0, 8).a).toBeGreaterThan(0); // panels still cover the sides
  });

  it("the left edge keeps its panel anchored on the left", () => {
    const buf = render({ edge: "left", movement: "open" }, 0.5);
    expect(buf.getPixel(0, 8).a).toBeGreaterThan(0);
    expect(buf.getPixel(15, 8).a).toBe(0);
  });

  it("a vertical edge sweeps along the height instead of the width", () => {
    const buf = render({ edge: "bottom", movement: "open" }, 0.5);
    expect(buf.getPixel(8, 0).a).toBeGreaterThan(0);
    expect(buf.getPixel(8, 15).a).toBe(0);
  });

  it("Repeat runs several open/close cycles across the effect", () => {
    const oneCycle = litCount(render({ movement: "open", repeat: 1 }, 0.5));
    const twoCycles = litCount(render({ movement: "open", repeat: 2 }, 0.5));
    expect(twoCycles).not.toBe(oneCycle); // 0.5 is mid-cycle for one, cycle boundary for two
  });

  it("swag makes the leading edge uneven across the curtain", () => {
    const buf = render({ edge: "left", movement: "open", swagPct: 80 }, 0.5);
    const edgeAt = (y: number): number => {
      let x = 0;
      while (x < 16 && buf.getPixel(x, y).a > 0) x++;
      return x;
    };
    expect(edgeAt(2)).not.toBe(edgeAt(8));
  });
});

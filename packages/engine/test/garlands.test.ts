import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { garlandDroop, renderGarlands, type GarlandsParams } from "../src/effects/garlands";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0)];
const BASE: GarlandsParams = { type: 0, spacing: 20, speed: 10, fillPct: 100 };

function render(params: Partial<GarlandsParams>, position01: number, w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderGarlands(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 1 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Garlands effect (SPEC ch8)", () => {
  it("droop pattern 0 is flat and deeper types sag further", () => {
    expect([0, 1, 2, 3].map((x) => garlandDroop(0, x))).toEqual([0, 0, 0, 0]);
    expect([0, 1, 2, 3].map((x) => garlandDroop(1, x))).toEqual([0, 1, 0, 1]);
    expect(Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((x) => garlandDroop(4, x)))).toBe(4);
  });

  it("droop patterns repeat, so any column index is defined", () => {
    expect(garlandDroop(2, 4)).toBe(garlandDroop(2, 0));
    expect(garlandDroop(4, 100)).toBeGreaterThanOrEqual(0);
  });

  it("garlands drop in over time: nothing at the start, rows on the buffer later", () => {
    expect(litCount(render({}, 0))).toBe(0);
    expect(litCount(render({}, 1))).toBeGreaterThan(0);
  });

  it("each garland lands as one row per column", () => {
    const buf = render({ type: 0, spacing: 50, fillPct: 100 }, 1);
    // one garland row of 16 pixels per ring; spacing 50% of 16 = 8 rows apart, fill 100% -> 2 rings
    expect(litCount(buf)).toBe(32);
  });

  it("a lower Fill draws fewer garlands", () => {
    expect(litCount(render({ fillPct: 30 }, 1))).toBeLessThan(litCount(render({ fillPct: 100 }, 1)));
  });

  it("renders identically for the same inputs (determinism)", () => {
    const a = render({ type: 3 }, 0.6);
    const b = render({ type: 3 }, 0.6);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(a.getPixel(x, y)).toEqual(b.getPixel(x, y));
  });

  it("handles a zero-sized buffer without throwing", () => {
    expect(() => render({}, 0.5, 0, 0)).not.toThrow();
  });
});

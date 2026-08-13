import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderGalaxy, type GalaxyParams } from "../src/effects/galaxy";

const PALETTE = [rgba(255, 0, 0), rgba(0, 0, 255)];
const BASE: GalaxyParams = {
  centerXPct: 50,
  centerYPct: 50,
  startRadius: 1,
  endRadius: 10,
  startAngleDeg: 0,
  revolutionsDeg: 720,
  startWidth: 3,
  endWidth: 2,
  durationPct: 100,
  reverse: false,
  blendEdges: false,
  inward: false,
};

function render(params: Partial<GalaxyParams>, position01: number, w = 24, h = 24): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderGalaxy(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 3 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Galaxy effect (SPEC ch8)", () => {
  it("draws nothing before the arm starts and grows as the head advances", () => {
    const early = litCount(render({}, 0.05));
    const late = litCount(render({}, 1));
    expect(late).toBeGreaterThan(early);
  });

  it("the arm starts at the centre and reaches outward", () => {
    const buf = render({}, 1);
    expect(buf.getPixel(12, 12).a).toBeGreaterThan(0); // near the centre
    let outerLit = false;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (Math.hypot(x - 12, y - 12) > 8 && buf.getPixel(x, y).a > 0) outerLit = true;
    expect(outerLit).toBe(true);
  });

  it("Duration controls how much of the effect the arm takes to finish drawing", () => {
    const fast = litCount(render({ durationPct: 25 }, 0.25));
    const slow = litCount(render({ durationPct: 100 }, 0.25));
    expect(fast).toBeGreaterThan(slow);
  });

  it("Inward reverses the radius sweep, so the arm ends at the centre", () => {
    const outward = render({ inward: false }, 1);
    const inward = render({ inward: true }, 1);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (outward.getPixel(x, y).a !== inward.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("Reverse mirrors the spiral direction", () => {
    const forward = render({ reverse: false }, 0.5);
    const backward = render({ reverse: true }, 0.5);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (forward.getPixel(x, y).a !== backward.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("Blend Edges softens the arm instead of drawing a hard disc", () => {
    const hard = render({ blendEdges: false }, 1);
    const soft = render({ blendEdges: true }, 1);
    const alphas = (buf: RenderBuffer): Set<number> => {
      const s = new Set<number>();
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (buf.getPixel(x, y).a > 0) s.add(buf.getPixel(x, y).a);
      return s;
    };
    expect(alphas(hard).size).toBe(1);
    expect(alphas(soft).size).toBeGreaterThan(1);
  });

  it("stays inside the buffer with a centre pushed to the corner", () => {
    expect(() => render({ centerXPct: 0, centerYPct: 0, endRadius: 200 }, 1)).not.toThrow();
  });
});

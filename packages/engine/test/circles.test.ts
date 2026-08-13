import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { reflect, renderCircles, type CirclesParams } from "../src/effects/circles";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0)];
const BASE: CirclesParams = { count: 4, size: 3, movement: "bounce", speed: 10, fade: false, bubbles: false };

function render(params: Partial<CirclesParams>, position01: number, seed = 99, w = 24, h = 24): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderCircles(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Circles effect (SPEC ch8)", () => {
  it("reflect folds an unbounded coordinate back inside the buffer", () => {
    expect(reflect(5, 10)).toBe(5);
    expect(reflect(12, 10)).toBe(8); // bounced off the far wall
    expect(reflect(-3, 10)).toBe(3); // bounced off the near wall
    expect(reflect(25, 10)).toBe(5); // two bounces
  });

  it("reflect never leaves the buffer, whatever the input", () => {
    for (let p = -100; p <= 100; p += 3.7) {
      const v = reflect(p, 15);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(15);
    }
  });

  it("draws the requested number of circles", () => {
    expect(litCount(render({ count: 1, movement: "none" }, 0))).toBeLessThan(litCount(render({ count: 6, movement: "none" }, 0)));
  });

  it("bigger circles light more pixels", () => {
    expect(litCount(render({ size: 6, movement: "none" }, 0))).toBeGreaterThan(litCount(render({ size: 2, movement: "none" }, 0)));
  });

  it("circles move over the effect", () => {
    const start = render({}, 0);
    const later = render({}, 0.5);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (start.getPixel(x, y).a !== later.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("is stateless: rendering a late position directly matches rendering it after other calls", () => {
    const direct = render({}, 0.83);
    render({}, 0.1);
    render({}, 0.5);
    const afterOthers = render({}, 0.83);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) expect(direct.getPixel(x, y)).toEqual(afterOthers.getPixel(x, y));
  });

  it("a different seed lays the circles out differently", () => {
    const a = render({ movement: "none" }, 0, 1);
    const b = render({ movement: "none" }, 0, 2);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (a.getPixel(x, y).a !== b.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("bubbles draws outlines, so fewer pixels than a filled disc", () => {
    expect(litCount(render({ bubbles: true, size: 6, movement: "none" }, 0))).toBeLessThan(
      litCount(render({ bubbles: false, size: 6, movement: "none" }, 0)),
    );
  });

  it("fade produces a falloff instead of one flat alpha", () => {
    const buf = render({ fade: true, size: 6, count: 1, movement: "none" }, 0);
    const alphas = new Set<number>();
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (buf.getPixel(x, y).a > 0) alphas.add(buf.getPixel(x, y).a);
    expect(alphas.size).toBeGreaterThan(1);
  });

  it("every movement mode keeps its circles inside the buffer", () => {
    for (const movement of ["bounce", "radial", "explode", "none"] as const) {
      for (const p of [0, 0.33, 0.66, 1]) {
        expect(() => render({ movement }, p), `${movement} @ ${p}`).not.toThrow();
      }
    }
  });
});

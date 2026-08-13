import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderFan, type FanParams } from "../src/effects/fan";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)];
const BASE: FanParams = {
  centerXPct: 50,
  centerYPct: 50,
  startRadiusPct: 0,
  endRadiusPct: 100,
  startAngleDeg: 0,
  revolutionsDeg: 360,
  bladeCount: 3,
  bladeWidthDeg: 40,
  bladeAngleDeg: 0,
  elementCount: 1,
  elementWidthPct: 100,
  reverse: false,
  blendEdges: false,
};

function render(params: Partial<FanParams>, position01: number, w = 24, h = 24): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderFan(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: position01, seed: 5 });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Fan effect (SPEC ch8)", () => {
  it("draws wedges rather than filling the buffer", () => {
    const lit = litCount(render({}, 0));
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(24 * 24);
  });

  it("wider blades cover more of the buffer", () => {
    expect(litCount(render({ bladeWidthDeg: 90 }, 0))).toBeGreaterThan(litCount(render({ bladeWidthDeg: 20 }, 0)));
  });

  it("more blades cover more of the buffer at the same blade width", () => {
    expect(litCount(render({ bladeCount: 6 }, 0))).toBeGreaterThan(litCount(render({ bladeCount: 2 }, 0)));
  });

  it("rotates over the effect", () => {
    const start = render({}, 0);
    const quarter = render({}, 0.25);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (start.getPixel(x, y).a !== quarter.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("the radius range confines the fan to an annulus", () => {
    const buf = render({ startRadiusPct: 60, endRadiusPct: 100 }, 0);
    expect(buf.getPixel(12, 12).a).toBe(0); // hole in the middle
    expect(litCount(buf)).toBeGreaterThan(0);
  });

  it("Num Elements cuts each blade into concentric arcs", () => {
    const solid = litCount(render({ elementCount: 1, elementWidthPct: 100 }, 0));
    const banded = litCount(render({ elementCount: 4, elementWidthPct: 50 }, 0));
    expect(banded).toBeLessThan(solid);
  });

  it("Blade Angle skews the blade so it curves with radius", () => {
    const straight = render({ bladeAngleDeg: 0 }, 0);
    const skewed = render({ bladeAngleDeg: 120 }, 0);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (straight.getPixel(x, y).a !== skewed.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("Reverse turns the fan the other way", () => {
    const forward = render({}, 0.1);
    const backward = render({ reverse: true }, 0.1);
    let differences = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (forward.getPixel(x, y).a !== backward.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });
});

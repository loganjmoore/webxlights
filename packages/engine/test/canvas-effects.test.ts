import { describe, expect, it } from "vitest";
import { rgba, type RGBA } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { renderAdjust, ADJUST_MODES, type AdjustParams } from "../src/effects/adjust";
import { renderKaleidoscope, KALEIDOSCOPE_TYPES, type KaleidoscopeParams } from "../src/effects/kaleidoscope";
import { renderWarp, WARP_TYPES, type WarpParams } from "../src/effects/warp";
import { defaultParamsFor } from "../src/effects/schema";
import type { FrameContext } from "../src/effects/types";

const RED = rgba(255, 0, 0, 255);
const CLEAR = rgba(0, 0, 0, 0);

function ctx(position01 = 0.5): FrameContext {
  return { frameIndexInEffect: 10, positionInEffect01: position01, seed: 7 };
}

// A canvas effect is handed what the layers underneath drew, so every test here starts from a
// buffer with something in it - the thing the effect is there to modify.
function canvas(width: number, height: number, paint: (x: number, y: number) => RGBA): RenderBuffer {
  const b = new RenderBuffer(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b.setPixel(x, y, paint(x, y));
  return b;
}

function snapshot(b: RenderBuffer): string {
  const out: string[] = [];
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    const p = b.getPixel(x, y);
    out.push(`${p.r},${p.g},${p.b},${p.a}`);
  }
  return out.join("|");
}

function litCount(b: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Kaleidoscope (manual: samples a section of the underlying effect and mirrors it)", () => {
  const params = (over: Partial<KaleidoscopeParams> = {}): KaleidoscopeParams => ({
    ...(defaultParamsFor("Kaleidoscope") as unknown as KaleidoscopeParams),
    ...over,
  });

  it("repeats one corner of the canvas across the whole model", () => {
    // A canvas that is lit only near the centre. After mirroring, the lit sample shows up in
    // more than one place - that repetition is what makes it a kaleidoscope.
    const b = canvas(16, 16, (x, y) => (x >= 7 && x <= 9 && y >= 7 && y <= 9 ? RED : CLEAR));
    const before = litCount(b);
    renderKaleidoscope(b, params({ size: 20 }));
    expect(litCount(b)).toBeGreaterThan(before);
  });

  it("is symmetrical about its centre", () => {
    const b = canvas(16, 16, (x, y) => (x < 8 && y < 8 ? RED : CLEAR));
    renderKaleidoscope(b, params({ centerX: 50, centerY: 50, size: 50, rotation: 0 }));
    // Mirroring folds a point back into the sample, so a point and its reflection through the
    // centre line read the same cell.
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 8; x++) {
        expect(b.getPixel(x, y), `x=${x} y=${y}`).toEqual(b.getPixel(15 - x, y));
      }
    }
  });

  it("samples rather than invents: an empty canvas stays empty", () => {
    // "By itself it does nothing." With nothing underneath there is nothing to mirror, and
    // drawing something anyway would be worse than drawing nothing.
    const b = new RenderBuffer(8, 8);
    renderKaleidoscope(b, params());
    expect(litCount(b)).toBe(0);
  });

  it("every type produces a pattern, and they aren't all the same pattern", () => {
    // The lit area has to fall inside the sample, or there is nothing to mirror and every type
    // correctly returns an empty model - which would make this test pass for the wrong reason.
    // It also has to be off both axes: the types differ in how they fold, and a shape already
    // symmetrical about the fold lines folds to the same thing under all of them.
    const shots = KALEIDOSCOPE_TYPES.map((type) => {
      const b = canvas(16, 16, (x, y) => (x >= 9 && x <= 11 && y >= 7 && y <= 8 ? RED : CLEAR));
      renderKaleidoscope(b, params({ type, size: 60 }));
      expect(litCount(b), type).toBeGreaterThan(0);
      return snapshot(b);
    });
    expect(new Set(shots).size).toBe(KALEIDOSCOPE_TYPES.length);
  });

  it("rotation turns the finished pattern", () => {
    // A small blob off both axes: a shape symmetrical about the centre would look the same after
    // a quarter turn and the test would pass without the rotation doing anything.
    const at = (rotation: number) => {
      const b = canvas(16, 16, (x, y) => (x >= 9 && x <= 11 && y >= 7 && y <= 8 ? RED : CLEAR));
      renderKaleidoscope(b, params({ rotation, size: 60 }));
      return snapshot(b);
    };
    expect(at(45)).not.toBe(at(0));
    expect(at(90)).not.toBe(at(0));
  });

  it("doesn't read pixels it has already overwritten", () => {
    // The fold reads cells this pass also writes. Sampling in place would mirror pixels that had
    // already been replaced, so the result would depend on the scan order rather than on the
    // canvas - a bug that looks like a plausible pattern and is impossible to spot by eye.
    const b = canvas(9, 9, (x, y) => (x === 4 && y === 4 ? RED : CLEAR));
    renderKaleidoscope(b, params({ size: 100 }));
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const p = b.getPixel(x, y);
        if (p.a > 0) expect(p).toEqual(RED); // only ever the colour that was actually there
      }
    }
  });
});

describe("Warp (manual: distorts the pixels in the layers below it)", () => {
  const params = (over: Partial<WarpParams> = {}): WarpParams => ({
    ...(defaultParamsFor("Warp") as unknown as WarpParams),
    ...over,
  });

  it("every warp type actually changes the canvas", () => {
    // A type in the props panel that the switch doesn't handle would leave the layer below
    // untouched, which reads as a working sequence and is why this is worth pinning.
    const before = snapshot(canvas(16, 16, (x, y) => ((x + y) % 3 === 0 ? RED : CLEAR)));
    for (const type of WARP_TYPES) {
      const b = canvas(16, 16, (x, y) => ((x + y) % 3 === 0 ? RED : CLEAR));
      renderWarp(b, params({ type, speed: 20 }), ctx());
      expect(snapshot(b), `${type} left the canvas untouched`).not.toBe(before);
    }
  });

  it("moves pixels rather than inventing them", () => {
    // Every type but Dissolve and Circle Reveal is a resample: a pixel reads from somewhere else
    // in the canvas, so no colour appears that wasn't already there.
    const b = canvas(16, 16, (x, y) => (y < 8 ? RED : CLEAR));
    renderWarp(b, params({ type: "Circular Swirl", speed: 30 }), ctx());
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const p = b.getPixel(x, y);
        if (p.a > 0) expect(p).toEqual(RED);
      }
    }
  });

  it("Circle Reveal grows from the centre as the effect runs", () => {
    const lit = (position01: number) => {
      const b = canvas(16, 16, () => RED);
      renderWarp(b, params({ type: "Circle Reveal", treatment: "Out" }), ctx(position01));
      return litCount(b);
    };
    expect(lit(0.2)).toBeLessThan(lit(0.8));
  });

  it("Dissolve takes pixels away, and takes more as it goes", () => {
    const lit = (position01: number) => {
      const b = canvas(16, 16, () => RED);
      renderWarp(b, params({ type: "Dissolve", treatment: "Out" }), ctx(position01));
      return litCount(b);
    };
    expect(lit(0.8)).toBeLessThan(lit(0.2));
    expect(lit(0.2)).toBeLessThan(256);
  });

  it("In and Out run the effect once, in opposite directions", () => {
    // "In performs it once in the inward direction and Out performs it once outward."
    const at = (treatment: WarpParams["treatment"], position01: number) => {
      const b = canvas(16, 16, () => RED);
      renderWarp(b, params({ type: "Circle Reveal", treatment }), ctx(position01));
      return litCount(b);
    };
    expect(at("Out", 0.9)).toBeGreaterThan(at("Out", 0.1));
    expect(at("In", 0.9)).toBeLessThan(at("In", 0.1));
  });

  it("leaves an empty canvas empty", () => {
    const b = new RenderBuffer(8, 8);
    renderWarp(b, params(), ctx());
    expect(litCount(b)).toBe(0);
  });
});

describe("Adjust (manual: used Canvas mode to offset channel values)", () => {
  const params = (over: Partial<AdjustParams> = {}): AdjustParams => ({
    ...(defaultParamsFor("Adjust") as unknown as AdjustParams),
    ...over,
  });
  const grey = (v: number) => rgba(v, v, v, 255);

  function adjusted(mode: AdjustParams["mode"], value: number, channel: number, extra: Partial<AdjustParams> = {}) {
    const b = canvas(1, 1, () => grey(channel));
    renderAdjust(b, params({ mode, value, ...extra }));
    return b.getPixel(0, 0).r;
  }

  it("offsets by a value, and clamps rather than wrapping", () => {
    expect(adjusted("Adjust By Value", 50, 100)).toBe(150);
    expect(adjusted("Adjust By Value", 50, 250)).toBe(255);
    expect(adjusted("Adjust By Value", -50, 20)).toBe(0);
  });

  it("offsets by a percentage of what was there", () => {
    expect(adjusted("Adjust By Percentage", -50, 100)).toBe(50);
    expect(adjusted("Adjust By Percentage", 100, 100)).toBe(200);
  });

  it("Set Minimum is a floor and Set Maximum a ceiling, leaving values already past them alone", () => {
    expect(adjusted("Set Minimum", 100, 40)).toBe(100);
    expect(adjusted("Set Minimum", 100, 200)).toBe(200);
    expect(adjusted("Set Maximum", 100, 200)).toBe(100);
    expect(adjusted("Set Maximum", 100, 40)).toBe(40);
  });

  it("Set Range rescales into the range instead of clipping to it", () => {
    // Clipping would flatten everything outside the range onto its edges, losing the shape of
    // what the layer below drew; rescaling keeps it.
    expect(adjusted("Set Range", 0, 0, { minimum: 100, maximum: 200 })).toBe(100);
    expect(adjusted("Set Range", 0, 255, { minimum: 100, maximum: 200 })).toBe(200);
    expect(adjusted("Set Range", 0, 128, { minimum: 100, maximum: 200 })).toBeGreaterThan(140);
  });

  it("the shift modes wrap round instead of clamping, which is the point of them", () => {
    expect(adjusted("Shift With Wrap By Value", 100, 200)).toBe(44);
    expect(adjusted("Shift With Wrap By Value", -100, 50)).toBe(206);
    expect(adjusted("Shift With Wrap By Percentage", 50, 200)).toBe(72);
  });

  it("Prevent Range pushes a value out to the nearer edge", () => {
    expect(adjusted("Prevent Range", 0, 110, { minimum: 100, maximum: 200 })).toBe(100);
    expect(adjusted("Prevent Range", 0, 190, { minimum: 100, maximum: 200 })).toBe(200);
    expect(adjusted("Prevent Range", 0, 50, { minimum: 100, maximum: 200 })).toBe(50); // already outside
  });

  it("Reverse inverts, and None changes nothing", () => {
    expect(adjusted("Reverse", 0, 200)).toBe(55);
    expect(adjusted("None", 0, 200)).toBe(200);
  });

  it("leaves alpha alone, so it doesn't light pixels the layer below left dark", () => {
    const b = canvas(2, 1, (x) => (x === 0 ? grey(100) : CLEAR));
    renderAdjust(b, params({ mode: "Set Minimum", value: 255 }));
    expect(b.getPixel(0, 0)).toEqual(grey(255));
    expect(b.getPixel(1, 0)).toEqual(CLEAR);
  });

  it("every mode in the list is actually handled", () => {
    // The fallthrough returns the channel unchanged, so an unhandled mode would be a control
    // that silently does nothing rather than an error.
    //
    // Each mode is probed with three channel values, because several of them legitimately leave
    // a given value alone: Set Minimum can't lower one already above the floor, and Prevent
    // Range only moves values that are inside the range. One probe would have made those look
    // unhandled.
    const probes = [40, 120, 200];
    for (const mode of ADJUST_MODES) {
      const moved = probes.some((c) => adjusted(mode, 100, c, { minimum: 80, maximum: 150 }) !== c);
      expect(moved, `"${mode}" changed nothing`).toBe(mode !== "None");
    }
  });
});

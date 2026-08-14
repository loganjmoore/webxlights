import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { parseSketchPaths, renderSketch, sketchToDefinition, type SketchParams } from "../src/effects/sketch";
import { defaultParamsFor } from "../src/effects/schema";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

function params(over: Partial<SketchParams> = {}): SketchParams {
  return { ...(defaultParamsFor("Sketch") as unknown as SketchParams), ...over };
}

function render(p: SketchParams, position01: number, palette = [RED, BLUE], size = 32): RenderBuffer {
  const b = new RenderBuffer(size, size);
  renderSketch(b, palette, p, { frameIndexInEffect: Math.round(position01 * 20), positionInEffect01: position01, seed: 1 });
  return b;
}

function litCount(b: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}

describe("the sketch path notation", () => {
  it("reads paths and their points", () => {
    expect(parseSketchPaths("M 0,0 L 1,1")).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
  });

  it("treats each M as a separate path", () => {
    const paths = parseSketchPaths("M 0,0 L 1,0 M 0,1 L 1,1");
    expect(paths).toHaveLength(2);
    expect(paths[1]).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });

  it("draws a definition that forgot its opening M rather than rendering nothing", () => {
    expect(parseSketchPaths("0,0 L 1,1")).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
  });

  it("skips coordinates it can't read instead of taking them as zero", () => {
    // A NaN taken as 0 would silently drag the line to a corner, which looks like a drawing
    // mistake rather than a parse one.
    expect(parseSketchPaths("M 0.5,0.5 L bad,0.9 L 0.8,0.8")).toEqual([
      [
        { x: 0.5, y: 0.5 },
        { x: 0.8, y: 0.8 },
      ],
    ]);
  });

  it("round-trips through the text form", () => {
    const paths = [[{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }], [{ x: 0, y: 1 }]];
    expect(parseSketchPaths(sketchToDefinition(paths))).toEqual(paths);
  });

  it("drops empty paths, which would otherwise consume a palette colour and draw nothing", () => {
    expect(parseSketchPaths("M M 0,0 L 1,1")).toHaveLength(1);
  });

  it("returns nothing for an empty or absent definition", () => {
    expect(parseSketchPaths("")).toEqual([]);
    expect(parseSketchPaths(undefined as unknown as string)).toEqual([]);
  });
});

describe("Sketch (manual: a path progressively drawn onto your model)", () => {
  it("draws itself in as the effect runs", () => {
    const p = params({ sketch: "M 0.05,0.5 L 0.95,0.5" });
    expect(litCount(render(p, 0.2))).toBeLessThan(litCount(render(p, 0.9)));
  });

  it("Draw Percentage decides how much of the effect the drawing takes", () => {
    // "Percentage of the effect duration over which the sketch progressively draws on", with the
    // completed sketch remaining visible afterwards.
    const quick = params({ sketch: "M 0.05,0.5 L 0.95,0.5", drawPercent: 25 });
    expect(litCount(render(quick, 0.3))).toBe(litCount(render(quick, 0.9)));

    const slow = params({ sketch: "M 0.05,0.5 L 0.95,0.5", drawPercent: 100 });
    expect(litCount(render(slow, 0.3))).toBeLessThan(litCount(render(slow, 0.9)));
  });

  it("Motion shows a moving window instead of an accumulating line", () => {
    // "The sketch is drawn over the entire effect duration but only a percentage of it is
    // rendered at any given moment."
    const p = params({ sketch: "M 0.05,0.5 L 0.95,0.5", motion: true, motionPercent: 20 });
    const early = render(p, 0.3);
    const late = render(p, 0.8);
    // Roughly the same amount is lit at both moments - it moved rather than grew.
    expect(Math.abs(litCount(early) - litCount(late))).toBeLessThan(litCount(late));
    // ...and it is somewhere else.
    const meanX = (b: RenderBuffer) => {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) { sum += x; n++; }
      return n ? sum / n : 0;
    };
    expect(meanX(late)).toBeGreaterThan(meanX(early));
  });

  it("gives each path the next palette colour", () => {
    // "Each separate path uses the next color from your selected palette."
    const b = render(params({ sketch: "M 0.05,0.2 L 0.95,0.2 M 0.05,0.8 L 0.95,0.8" }), 1);
    const rowColor = (y: number) => {
      for (let x = 0; x < b.width; x++) {
        const p = b.getPixel(x, Math.round(y * (b.height - 1)));
        if (p.a > 0) return p;
      }
      return null;
    };
    expect(rowColor(0.2)).toEqual(RED);
    expect(rowColor(0.8)).toEqual(BLUE);
  });

  it("Thickness widens the line", () => {
    const thin = params({ sketch: "M 0.05,0.5 L 0.95,0.5", thickness: 1 });
    const thick = params({ sketch: "M 0.05,0.5 L 0.95,0.5", thickness: 5 });
    expect(litCount(render(thick, 1))).toBeGreaterThan(litCount(render(thin, 1)));
  });

  it("draws a long path proportionally slower than a short one, which is what reads as drawing", () => {
    // Progress is measured along the whole sketch's length, not per segment, so a stroke twice as
    // long takes twice as long to appear rather than each stroke taking an equal share.
    const p = params({ sketch: "M 0.05,0.5 L 0.35,0.5 M 0.4,0.5 L 0.95,0.5" });
    const half = render(p, 0.5);
    // At the halfway point the short first stroke is finished and the long second one isn't.
    let leftLit = 0;
    let rightLit = 0;
    for (let y = 0; y < half.height; y++) {
      for (let x = 0; x < half.width; x++) {
        if (half.getPixel(x, y).a === 0) continue;
        if (x < half.width * 0.4) leftLit++;
        else rightLit++;
      }
    }
    expect(leftLit).toBeGreaterThan(0);
    expect(rightLit).toBeGreaterThan(0);
    expect(rightLit).toBeLessThan(litCount(render(p, 1)) - leftLit);
  });

  it("scales to the model rather than to the size it was drawn on", () => {
    // Coordinates are 0..1, so a sketch traced once renders on every prop it is put on.
    const p = params({ sketch: "M 0,0 L 1,1" });
    for (const size of [8, 32, 64]) {
      expect(litCount(render(p, 1, [RED], size)), `size ${size}`).toBeGreaterThan(size / 2);
    }
  });

  it("renders nothing for an empty sketch, rather than throwing", () => {
    expect(litCount(render(params({ sketch: "" }), 1))).toBe(0);
    expect(() => renderSketch(new RenderBuffer(0, 0), [RED], params(), { frameIndexInEffect: 0, positionInEffect01: 1, seed: 1 })).not.toThrow();
  });
});

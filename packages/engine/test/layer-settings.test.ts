import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import {
  applyBlur,
  applyTransform,
  isFullSubBuffer,
  renderWithLayerSettings,
  subBufferRect,
} from "../src/layerSettings";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);
const CLEAR = rgba(0, 0, 0, 0);

function filled(width: number, height: number, paint: (x: number, y: number) => ReturnType<typeof rgba>): RenderBuffer {
  const b = new RenderBuffer(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b.setPixel(x, y, paint(x, y));
  return b;
}

function litPixels(b: RenderBuffer): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) out.push([x, y]);
  return out;
}

describe("Transformation (manual: Sequencer > Layers > Layer Settings)", () => {
  it("flips horizontally", () => {
    const b = filled(4, 1, (x) => (x === 0 ? RED : CLEAR));
    applyTransform(b, "Flip Horizontal");
    expect(litPixels(b)).toEqual([[3, 0]]);
  });

  it("flips vertically", () => {
    const b = filled(1, 4, (_x, y) => (y === 0 ? RED : CLEAR));
    applyTransform(b, "Flip Vertical");
    expect(litPixels(b)).toEqual([[0, 3]]);
  });

  it("turns a corner pixel through 180 degrees to the opposite corner", () => {
    const b = filled(3, 3, (x, y) => (x === 0 && y === 0 ? RED : CLEAR));
    applyTransform(b, "Rotate 180");
    expect(litPixels(b)).toEqual([[2, 2]]);
  });

  it("rotates a square buffer a quarter turn each way, and the two undo each other", () => {
    const original = filled(3, 3, (x, y) => (x === 0 && y === 2 ? RED : CLEAR)); // top-left
    const cw = filled(3, 3, (x, y) => original.getPixel(x, y));
    applyTransform(cw, "Rotate CW 90");
    expect(litPixels(cw)).toEqual([[2, 2]]); // top-left goes to top-right

    applyTransform(cw, "Rotate CC 90");
    expect(litPixels(cw)).toEqual(litPixels(original));
  });

  it("leaves the buffer alone for None", () => {
    const b = filled(3, 2, (x) => (x === 1 ? RED : CLEAR));
    const before = litPixels(b);
    applyTransform(b, "None");
    expect(litPixels(b)).toEqual(before);
  });

  it("keeps a non-square buffer's own dimensions when it rotates", () => {
    // A model's buffer can't change shape to suit the effect, so a quarter turn stretches to
    // fit rather than spilling outside or leaving a hole.
    const b = filled(8, 2, (x, y) => (y === 0 ? RED : CLEAR));
    applyTransform(b, "Rotate CW 90");
    expect(b.width).toBe(8);
    expect(b.height).toBe(2);
    expect(litPixels(b).length).toBeGreaterThan(0);
  });
});

describe("Blur", () => {
  it("does nothing at 1, which is the off position", () => {
    const b = filled(5, 1, (x) => (x === 2 ? RED : CLEAR));
    applyBlur(b, 1);
    expect(litPixels(b)).toEqual([[2, 0]]);
  });

  it("spreads a lit pixel into its neighbours", () => {
    const b = filled(5, 1, (x) => (x === 2 ? RED : CLEAR));
    applyBlur(b, 2);
    const lit = litPixels(b).map(([x]) => x);
    expect(lit).toContain(1);
    expect(lit).toContain(3);
  });

  it("keeps the colour of a lit pixel rather than dragging it towards black", () => {
    // Averaging straight RGB against transparent neighbours is what makes a naive blur muddy;
    // weighting by alpha keeps the hue and only softens the coverage.
    const b = filled(5, 1, (x) => (x === 2 ? RED : CLEAR));
    applyBlur(b, 2);
    const p = b.getPixel(2, 0);
    expect(p.r).toBeGreaterThan(200);
    expect(p.g).toBe(0);
    expect(p.b).toBe(0);
    expect(p.a).toBeLessThan(255); // ...but it is dimmer, because it now covers more ground
  });

  it("blends two colours into each other at their boundary", () => {
    const b = filled(6, 1, (x) => (x < 3 ? RED : BLUE));
    applyBlur(b, 3);
    const middle = b.getPixel(3, 0);
    expect(middle.r).toBeGreaterThan(0);
    expect(middle.b).toBeGreaterThan(0);
  });
});

describe("Sub Buffer", () => {
  it("is a no-op at full size", () => {
    expect(isFullSubBuffer(undefined)).toBe(true);
    expect(isFullSubBuffer({ x1: 0, y1: 0, x2: 100, y2: 100 })).toBe(true);
    expect(isFullSubBuffer({ x1: 0, y1: 50, x2: 100, y2: 100 })).toBe(false);
  });

  it("turns percentages into a pixel rectangle", () => {
    expect(subBufferRect({ x1: 0, y1: 50, x2: 100, y2: 100 }, 10, 10)).toEqual({ x: 0, y: 5, width: 10, height: 5 });
    expect(subBufferRect({ x1: 25, y1: 0, x2: 75, y2: 100 }, 20, 8)).toEqual({ x: 5, y: 0, width: 10, height: 8 });
  });

  it("accepts the corners in either order", () => {
    expect(subBufferRect({ x1: 75, y1: 100, x2: 25, y2: 0 }, 20, 8)).toEqual(subBufferRect({ x1: 25, y1: 0, x2: 75, y2: 100 }, 20, 8));
  });

  it("never collapses to nothing, because an effect can't render into a zero-wide buffer", () => {
    const rect = subBufferRect({ x1: 50, y1: 50, x2: 50, y2: 50 }, 10, 10);
    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });

  it("gives the effect a smaller canvas rather than cropping a full-size render", () => {
    // The manual's own distinction: "the entire effect is rendered based on this new model
    // size, whereas a mask covers up what you specify". An effect that fills whatever it is
    // handed must therefore fill exactly the sub-buffer.
    const target = new RenderBuffer(10, 10);
    let sawWidth = 0;
    let sawHeight = 0;
    renderWithLayerSettings(target, { subBuffer: { x1: 0, y1: 50, x2: 100, y2: 100 } }, (buffer) => {
      sawWidth = buffer.width;
      sawHeight = buffer.height;
      buffer.fill(RED);
    });
    expect([sawWidth, sawHeight]).toEqual([10, 5]);
    expect(target.getPixel(0, 5).a).toBe(255); // inside
    expect(target.getPixel(0, 4).a).toBe(0); // below it, untouched
  });

  it("places the sub-buffer where the percentages say, not at the origin", () => {
    const target = new RenderBuffer(10, 10);
    renderWithLayerSettings(target, { subBuffer: { x1: 60, y1: 0, x2: 100, y2: 40 } }, (buffer) => buffer.fill(BLUE));
    expect(target.getPixel(7, 1).b).toBe(255);
    expect(target.getPixel(1, 7).a).toBe(0);
  });
});

describe("the settings compose, and cost nothing when unset", () => {
  it("renders straight into the target when there is nothing to apply", () => {
    const target = new RenderBuffer(4, 4);
    let handed: RenderBuffer | null = null;
    renderWithLayerSettings(target, undefined, (buffer) => {
      handed = buffer;
    });
    expect(handed).toBe(target);
  });

  it("applies transform and blur inside the sub-buffer, not across the whole model", () => {
    const target = new RenderBuffer(8, 4);
    renderWithLayerSettings(
      target,
      { subBuffer: { x1: 0, y1: 0, x2: 50, y2: 100 }, transform: "Flip Horizontal" },
      (buffer) => {
        buffer.setPixel(0, 0, RED); // left edge of the sub-buffer
      },
    );
    // Flipped within its own four-wide half, so it lands at x=3 - not at x=7, which is where a
    // flip across the whole model would have put it.
    expect(target.getPixel(3, 0).a).toBe(255);
    expect(target.getPixel(7, 0).a).toBe(0);
  });
});

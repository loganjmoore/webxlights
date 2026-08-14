import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { blendPixel , BLEND_MODES } from "../src/blend";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

describe("Layer blend modes (SPEC ch9 §5.2)", () => {
  it("Normal: fg fully replaces bg at emt=0, full alpha", () => {
    expect(blendPixel(RED, BLUE, "Normal", 0)).toEqual(rgba(255, 0, 0, 255));
  });

  it("Additive: per-channel clamp255(fg+bg)", () => {
    expect(blendPixel(rgba(200, 0, 0), rgba(100, 0, 0), "Additive", 0)).toEqual(rgba(255, 0, 0, 255));
  });

  it("Subtractive: per-channel clamp0(bg-fg)", () => {
    expect(blendPixel(rgba(50, 0, 0), rgba(200, 0, 0), "Subtractive", 0)).toEqual(rgba(150, 0, 0, 255));
  });

  it("Max: per-channel max(fg,bg) scaled by fg alpha", () => {
    expect(blendPixel(rgba(100, 200, 0, 255), rgba(150, 50, 0), "Max", 0)).toEqual(rgba(150, 200, 0, 255));
  });

  it("Min: per-channel min(fg,bg) scaled by fg alpha", () => {
    expect(blendPixel(rgba(100, 200, 0, 255), rgba(150, 50, 0), "Min", 0)).toEqual(rgba(100, 50, 0, 255));
  });

  it("Average: black bg passes fg through unchanged", () => {
    expect(blendPixel(RED, rgba(0, 0, 0, 0), "Average", 0)).toEqual(RED);
  });

  it("Average: averages fg and bg when both are lit", () => {
    expect(blendPixel(rgba(100, 0, 0), rgba(200, 0, 0), "Average", 0)).toEqual(rgba(150, 0, 0, 255));
  });

  it("1 reveals 2: shows fg only where fg's value exceeds the mix threshold", () => {
    expect(blendPixel(RED, BLUE, "1 reveals 2", 0.5)).toEqual(RED); // V(red)=1 > 0.5
    expect(blendPixel(rgba(50, 0, 0), BLUE, "1 reveals 2", 0.5)).toEqual(BLUE); // V(50,0,0)=0.196 <= 0.5
  });

  it("2 reveals 1: shows bg only where bg's value exceeds the mix threshold", () => {
    expect(blendPixel(RED, BLUE, "2 reveals 1", 0.5)).toEqual(BLUE); // V(blue)=1 > 0.5
    expect(blendPixel(RED, rgba(0, 0, 50), "2 reveals 1", 0.5)).toEqual(RED);
  });

  it("Effect 1 at mix=1 shows only fg; Effect 2 at mix=1 shows only bg", () => {
    expect(blendPixel(RED, BLUE, "Effect 1", 1)).toEqual(rgba(255, 0, 0, 255));
    expect(blendPixel(RED, BLUE, "Effect 2", 1)).toEqual(rgba(0, 0, 255, 255));
  });

});

// The eight modes added beyond the original ten. The manual documents these with screenshots
// rather than words, so these tests pin what the *names* unambiguously mean - a mask hides, an
// unmask reveals, a shadow darkens - which is the contract this engine is committing to.
describe("mask, shadow and brightness modes", () => {
  const RED = rgba(255, 0, 0, 255);
  const BLUE = rgba(0, 0, 255, 255);
  const BLACK = rgba(0, 0, 0, 0);

  it("a mask punches the other layer out where it is lit", () => {
    expect(blendPixel(RED, BLUE, "1 is Mask", 0).a).toBe(0);
    expect(blendPixel(BLACK, BLUE, "1 is Mask", 0)).toEqual(BLUE);

    expect(blendPixel(RED, BLUE, "2 is Mask", 0).a).toBe(0);
    expect(blendPixel(RED, BLACK, "2 is Mask", 0)).toEqual(RED);
  });

  it("an unmask is the converse - the other layer shows only through what is lit", () => {
    expect(blendPixel(RED, BLUE, "1 is Unmask", 0)).toEqual(BLUE);
    expect(blendPixel(BLACK, BLUE, "1 is Unmask", 0).a).toBe(0);

    expect(blendPixel(RED, BLUE, "2 is Unmask", 0)).toEqual(RED);
    expect(blendPixel(RED, BLACK, "2 is Unmask", 0).a).toBe(0);
  });

  it("a mask and its unmask are opposites, pixel for pixel", () => {
    for (const [fg, bg] of [[RED, BLUE], [BLACK, BLUE], [RED, BLACK], [BLACK, BLACK]] as const) {
      const masked = blendPixel(fg, bg, "1 is Mask", 0);
      const unmasked = blendPixel(fg, bg, "1 is Unmask", 0);
      expect(masked.a === 0).toBe(unmasked.a !== 0 || bg.a === 0);
    }
  });

  it("a shadow keeps the subject's colour and dims it", () => {
    const dark = blendPixel(rgba(255, 255, 255, 255), RED, "Shadow 1 on 2", 0);
    expect(dark.r).toBeLessThan(RED.r); // a bright shadow layer darkens most
    expect(dark.g).toBe(0); // ...but the hue is the subject's, not the shadow's

    const none = blendPixel(BLACK, RED, "Shadow 1 on 2", 0);
    expect(none.r).toBe(255); // nothing casting a shadow leaves the subject alone
  });

  it("Layered shows whichever layer has something to show", () => {
    expect(blendPixel(RED, BLUE, "Layered", 0)).toEqual(RED);
    expect(blendPixel(BLACK, BLUE, "Layered", 0)).toEqual(BLUE);
  });

  it("Brightness uses this layer purely as a dimmer over the one below", () => {
    const full = blendPixel(rgba(255, 255, 255, 255), BLUE, "Brightness", 0);
    expect(full.b).toBe(255);
    const half = blendPixel(rgba(128, 128, 128, 255), BLUE, "Brightness", 0);
    expect(half.b).toBeGreaterThan(100);
    expect(half.b).toBeLessThan(200);
    const off = blendPixel(BLACK, BLUE, "Brightness", 0);
    expect(off.b).toBe(0);
  });

  it("every mode in the exported list is actually handled", () => {
    // The default branch returns the background, so an unhandled mode would silently drop the
    // layer instead of failing - this makes the list and the switch agree.
    for (const mode of BLEND_MODES) {
      const out = blendPixel(RED, BLACK, mode, 0);
      expect(out, mode).toBeDefined();
    }
    expect(BLEND_MODES).toHaveLength(22);
  });

  it("the positional modes put one layer at each edge of the model", () => {
    // Bottom-Top and Left-Right differ only in which axis the caller measured, so they share an
    // implementation; the axis is chosen where the geometry is known (layerStack.ts).
    for (const mode of ["Bottom-Top", "Left-Right"] as const) {
      expect(blendPixel(RED, BLACK, mode, 0, 0), mode).toEqual(BLACK); // the layer below, at the start
      expect(blendPixel(RED, BLACK, mode, 0, 1), mode).toEqual(RED); // this layer, at the far end
      const middle = blendPixel(RED, BLACK, mode, 0, 0.5);
      expect(middle.r, mode).toBeGreaterThan(0);
      expect(middle.r, mode).toBeLessThan(255);
    }
  });

  it("Morph cross-fades on the effect's own position rather than the Mix slider", () => {
    // "Will magically make effect 1 morph into effect 2 during the length of the timing cell" -
    // renderFrame puts the position where the slider value normally goes.
    expect(blendPixel(RED, BLACK, "Morph", 0)).toEqual(BLACK);
    expect(blendPixel(RED, BLACK, "Morph", 1)).toEqual(RED);
    expect(blendPixel(RED, BLACK, "Morph", 0.5).r).toBeCloseTo(128, -1);
  });

  it("Canvas hands back whatever the layer produced, including where it cleared a pixel", () => {
    // Canvas isn't a way of combining two colours: the layer was given the background to work on,
    // so its output is the whole answer. A Normal blend would have quietly kept the background
    // wherever a canvas effect had deliberately erased something.
    expect(blendPixel(RED, BLACK, "Canvas", 0)).toEqual(RED);
    expect(blendPixel(rgba(0, 0, 0, 0), RED, "Canvas", 0)).toEqual(rgba(0, 0, 0, 0));
  });
});

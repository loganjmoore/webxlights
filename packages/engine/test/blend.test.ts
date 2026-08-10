import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { blendPixel } from "../src/blend";

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

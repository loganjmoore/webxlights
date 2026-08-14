import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKGROUND_OPACITY,
  MAX_BACKGROUND_EDGE,
  backgroundFrom,
  clampOpacity,
  scaledSize,
} from "../src/lib/backgroundImage";

describe("scaling a photo down to something a settings row can carry", () => {
  it("leaves an already-small image alone", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("caps the long edge and keeps the shape", () => {
    const scaled = scaledSize(4000, 3000);
    expect(scaled.width).toBe(MAX_BACKGROUND_EDGE);
    expect(scaled.height).toBe(Math.round((3000 / 4000) * MAX_BACKGROUND_EDGE));
  });

  it("caps the long edge whichever way round the photo is", () => {
    expect(scaledSize(3000, 4000).height).toBe(MAX_BACKGROUND_EDGE);
  });

  it("never scales the short edge to nothing", () => {
    // A very long, very thin image would otherwise decode to a zero-height canvas and come back
    // blank rather than as an error.
    expect(scaledSize(20000, 5).height).toBe(1);
  });

  it("copes with a zero-sized image rather than dividing by it", () => {
    expect(scaledSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("reading a layout's stored background", () => {
  const stored = { dataUrl: "data:image/jpeg;base64,abc", width: 1600, height: 900, opacity: 60 };

  it("reads one back with its opacity", () => {
    expect(backgroundFrom({ backgroundImage: stored })).toEqual(stored);
  });

  it("returns null for a layout that predates backgrounds", () => {
    expect(backgroundFrom(undefined)).toBeNull();
    expect(backgroundFrom({})).toBeNull();
    expect(backgroundFrom({ views: [] })).toBeNull();
  });

  it("refuses anything that isn't an image data URL", () => {
    // The settings bag is free-form JSON, so what comes back has to be checked rather than
    // trusted - a stray string here would be handed straight to an <img src>.
    expect(backgroundFrom({ backgroundImage: { dataUrl: "https://example.com/house.jpg" } })).toBeNull();
    expect(backgroundFrom({ backgroundImage: { dataUrl: "javascript:alert(1)" } })).toBeNull();
    expect(backgroundFrom({ backgroundImage: "not an object" })).toBeNull();
  });

  it("falls back to a sensible opacity when the stored one is missing or nonsense", () => {
    expect(backgroundFrom({ backgroundImage: { dataUrl: stored.dataUrl } })!.opacity).toBe(DEFAULT_BACKGROUND_OPACITY);
    expect(backgroundFrom({ backgroundImage: { dataUrl: stored.dataUrl, opacity: "loud" } })!.opacity).toBe(
      DEFAULT_BACKGROUND_OPACITY,
    );
  });
});

describe("opacity", () => {
  it("stays within 0-100 whatever it is given", () => {
    expect(clampOpacity(-20)).toBe(0);
    expect(clampOpacity(200)).toBe(100);
    expect(clampOpacity(45.6)).toBe(46);
  });

  it("falls back rather than producing NaN", () => {
    expect(clampOpacity(undefined)).toBe(DEFAULT_BACKGROUND_OPACITY);
    expect(clampOpacity("loud")).toBe(DEFAULT_BACKGROUND_OPACITY);
  });
});

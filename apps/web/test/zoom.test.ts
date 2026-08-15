import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM_INDEX,
  ZOOM_STEPS,
  clampZoomIndex,
  scrollLeftHolding,
  wheelScrollDelta,
  zoomIndexIn,
  zoomIndexOut,
} from "../src/lib/zoom";

describe("the zoom ladder", () => {
  it("goes further in and further out than three levels did", () => {
    // 2x is nowhere near enough to place an effect against a 50ms frame in a four-minute song,
    // and 0.25x is what "show me the whole thing" means for one.
    expect(Math.max(...ZOOM_STEPS)).toBeGreaterThanOrEqual(8);
    expect(Math.min(...ZOOM_STEPS)).toBeLessThanOrEqual(0.5);
  });

  it("is in order, so a step is always a step in the same direction", () => {
    expect([...ZOOM_STEPS]).toEqual([...ZOOM_STEPS].sort((a, b) => a - b));
  });

  it("opens at fit-to-width", () => {
    expect(ZOOM_STEPS[DEFAULT_ZOOM_INDEX]).toBe(1);
  });

  it("steps in and out, and stops at the ends rather than wrapping", () => {
    expect(zoomIndexIn(0)).toBe(1);
    expect(zoomIndexOut(1)).toBe(0);
    expect(zoomIndexOut(0)).toBe(0);
    expect(zoomIndexIn(ZOOM_STEPS.length - 1)).toBe(ZOOM_STEPS.length - 1);
  });

  it("clamps a stored index onto the ladder", () => {
    // A saved index from a shorter ladder would otherwise index past the end and make pxPerMs NaN,
    // which draws nothing at all.
    expect(clampZoomIndex(99)).toBe(ZOOM_STEPS.length - 1);
    expect(clampZoomIndex(-3)).toBe(0);
    expect(clampZoomIndex(Number.NaN)).toBe(DEFAULT_ZOOM_INDEX);
  });
});

describe("holding a moment still across a zoom", () => {
  const LABEL = 140;

  it("puts the anchored moment back under the same point on screen", () => {
    // Without this, zooming in on the second chorus lands you in the first verse: the content
    // grows from its left edge while the viewport stays where it was.
    const scroll = scrollLeftHolding(10_000, 400, 0.2, LABEL, 100_000);
    // 140 + 10000*0.2 = 2140 content px; minus the 400px the pointer sits in = 1740.
    expect(scroll).toBe(1740);
  });

  it("never scrolls past either end", () => {
    expect(scrollLeftHolding(0, 800, 0.2, LABEL, 100_000)).toBe(0);
    expect(scrollLeftHolding(1_000_000, 0, 0.2, LABEL, 5000)).toBe(5000);
  });

  it("holds the same moment whichever zoom it is called at", () => {
    // The anchor is a moment, not a pixel, so the arithmetic has to work off the new scale.
    const offset = 300;
    for (const pxPerMs of [0.05, 0.2, 1.6]) {
      const scroll = scrollLeftHolding(20_000, offset, pxPerMs, LABEL, 1e9);
      // Where the moment ends up on screen = its content x minus the scroll.
      expect(LABEL + 20_000 * pxPerMs - scroll).toBeCloseTo(offset);
    }
  });
});

describe("which wheel axis a shift+wheel scroll follows", () => {
  it("takes whichever axis actually moved", () => {
    // A mouse reports the shift-modified scroll on deltaX on some platforms and deltaY on others;
    // taking the larger magnitude means the gesture works the same everywhere.
    expect(wheelScrollDelta(0, 120)).toBe(120);
    expect(wheelScrollDelta(-90, 0)).toBe(-90);
  });

  it("prefers the dominant axis on a trackpad, which reports both", () => {
    expect(wheelScrollDelta(80, 12)).toBe(80);
    expect(wheelScrollDelta(5, -60)).toBe(-60);
  });
});

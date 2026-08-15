import { describe, expect, it } from "vitest";
import { fadeDurationAt, withFade } from "../src/lib/effectFade";

const effect = { startMs: 1000, endMs: 3000 };

describe("the fade length a drag means", () => {
  it("is measured inwards from the edge being dragged", () => {
    // "Drag the left edge of an effect inwards to create a fade in, or drag the right edge
    // inwards to create a fade out." The distance dragged in *is* the fade.
    expect(fadeDurationAt(effect, "left", 1400)).toBe(400);
    expect(fadeDurationAt(effect, "right", 2500)).toBe(500);
  });

  it("is nothing at the edge itself", () => {
    expect(fadeDurationAt(effect, "left", 1000)).toBe(0);
    expect(fadeDurationAt(effect, "right", 3000)).toBe(0);
  });

  it("is nothing when dragged outwards, rather than a negative", () => {
    // Dragging back out past the edge is how the fade is removed.
    expect(fadeDurationAt(effect, "left", 500)).toBe(0);
    expect(fadeDurationAt(effect, "right", 4000)).toBe(0);
  });

  it("can't run past the far end of the effect", () => {
    expect(fadeDurationAt(effect, "left", 9000)).toBe(2000);
  });

  it("leaves room for the fade at the other end", () => {
    // An in and an out that crossed would ask the renderer to reveal and hide the same frames at
    // once, and what that looks like is not something anyone chose.
    const withOut = { ...effect, transition: { outDurationMs: 1500 } };
    expect(fadeDurationAt(withOut, "left", 9000)).toBe(500);
    const withIn = { ...effect, transition: { inDurationMs: 1800 } };
    expect(fadeDurationAt(withIn, "right", 0)).toBe(200);
  });

  it("copes with an effect whose other fade is longer than it is", () => {
    // Shortening an effect can leave a fade longer than what's left of it; the drag should give
    // zero rather than a negative that would then be stored.
    const silly = { startMs: 0, endMs: 500, transition: { outDurationMs: 5000 } };
    expect(fadeDurationAt(silly, "left", 400)).toBe(0);
  });
});

describe("the transition a fade drag produces", () => {
  it("sets the duration for the edge that was dragged", () => {
    expect(withFade(undefined, "left", 400)).toEqual({ inDurationMs: 400 });
    expect(withFade(undefined, "right", 250)).toEqual({ outDurationMs: 250 });
  });

  it("leaves the other end alone", () => {
    expect(withFade({ inDurationMs: 100 }, "right", 250)).toEqual({ inDurationMs: 100, outDurationMs: 250 });
  });

  it("keeps a reveal type someone already chose", () => {
    // Shift-dragging the edge of an effect given a Circle Explode should adjust *that*, not
    // silently turn it into a fade.
    expect(withFade({ inType: "Circle Explode", inDurationMs: 100 }, "left", 700)).toEqual({
      inType: "Circle Explode",
      inDurationMs: 700,
    });
  });

  it("clears a transition this gesture created once it is dragged back to nothing", () => {
    // So an undone fade leaves no empty object behind to puzzle over in the panel.
    expect(withFade(undefined, "left", 0)).toBeUndefined();
  });

  it("keeps a transition that existed before, even at zero length", () => {
    // The reveal type was chosen deliberately and this gesture never touched it; throwing it away
    // because a fade went to zero would lose a setting silently.
    expect(withFade({ inType: "Star" }, "left", 0)).toEqual({ inType: "Star", inDurationMs: 0 });
    expect(withFade({ outDurationMs: 300 }, "left", 0)).toEqual({ outDurationMs: 300, inDurationMs: 0 });
  });
});

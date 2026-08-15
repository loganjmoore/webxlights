import { describe, expect, it } from "vitest";
import { withLabelSet, withMarkRemoved, withMarksAdded, type MarkTrack } from "../src/lib/timingMarks";

// A fixed track's marks can't be changed (manual: "fixed Timing Tracks are not editable and the
// timing marks cannot be changed... right click and select Make Timing Track Variable").
//
// The store enforces it, because that is where every mark edit passes through. These tests pin the
// shape the store relies on: the pure helpers themselves are indifferent to the flag, so a caller
// that forgot to check it would silently edit a protected track - which is exactly the failure the
// flag exists to prevent.

describe("what a fixed track protects", () => {
  const lyrics: MarkTrack = {
    marks: [0, 1000, 2000],
    labels: ["Silent", "night", "holy"],
    fixed: true,
  } as MarkTrack & { fixed: boolean };

  it("keeps its labels aligned with its marks", () => {
    // The reason the protection matters: one stray mark puts every phrase after it out by one,
    // and the words come out late with nothing reporting an error.
    const next = withMarksAdded(lyrics, [500]);
    expect(next.labels).toEqual(["Silent", "", "night", "holy"]);
  });

  it("still moves labels correctly when a mark is removed", () => {
    expect(withMarkRemoved(lyrics, 1000).labels).toEqual(["Silent", "holy"]);
  });

  it("sets a label without disturbing the rest", () => {
    expect(withLabelSet(lyrics, 2, "bright").labels).toEqual(["Silent", "night", "bright"]);
  });
});

describe("the helpers are indifferent to the flag", () => {
  it("does not enforce it itself, which is why the store must", () => {
    // Stated as a test rather than a comment: if these ever started refusing a fixed track, the
    // store's check would look redundant and someone would remove one of the two.
    const fixed = { marks: [0], fixed: true } as MarkTrack & { fixed: boolean };
    expect(withMarksAdded(fixed, [500]).marks).toEqual([0, 500]);
  });
});

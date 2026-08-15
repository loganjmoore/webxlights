import { describe, expect, it } from "vitest";
import { loopWithin, rangeFromDrag, startOfPlay } from "../src/lib/playRange";

const RANGE = { startMs: 4000, endMs: 8000 };

describe("starting play with a range marked", () => {
  it("jumps into the range when the playhead is outside it", () => {
    // "Highlighting a portion of the waveform will cause only that section to be played" - so
    // play means play *that*, not "carry on from wherever the playhead happens to be".
    expect(startOfPlay(RANGE, 0)).toBe(4000);
    expect(startOfPlay(RANGE, 9000)).toBe(4000);
  });

  it("carries on from where it is when already inside", () => {
    // Otherwise pausing mid-phrase and pressing play would always throw you back to the start.
    expect(startOfPlay(RANGE, 6000)).toBeNull();
  });

  it("does nothing without a range", () => {
    expect(startOfPlay(null, 1234)).toBeNull();
  });

  it("treats the end of the range as outside it", () => {
    // The end is exclusive: sitting exactly on it means the last loop finished.
    expect(startOfPlay(RANGE, 8000)).toBe(4000);
  });
});

describe("looping while it plays", () => {
  it("goes back to the start when it reaches the end", () => {
    expect(loopWithin(RANGE, 8000, true)).toBe(4000);
    expect(loopWithin(RANGE, 8500, true)).toBe(4000);
  });

  it("leaves the playhead alone inside the range", () => {
    expect(loopWithin(RANGE, 4000, true)).toBeNull();
    expect(loopWithin(RANGE, 7999, true)).toBeNull();
  });

  it("catches a seek that lands before the range, but tolerates the first frames of it", () => {
    // A seek during playback should snap back; playing the opening milliseconds should not be
    // mistaken for having left.
    expect(loopWithin(RANGE, 1000, true)).toBe(4000);
    expect(loopWithin(RANGE, 3950, true)).toBeNull();
  });

  it("does nothing while paused, or without a range", () => {
    expect(loopWithin(RANGE, 9000, false)).toBeNull();
    expect(loopWithin(null, 9000, true)).toBeNull();
  });
});

describe("marking a range by dragging", () => {
  it("works in either direction", () => {
    expect(rangeFromDrag(8000, 4000)).toEqual(RANGE);
    expect(rangeFromDrag(4000, 8000)).toEqual(RANGE);
  });

  it("refuses a drag too short to be a range", () => {
    // A zero-length range would loop forever without advancing.
    expect(rangeFromDrag(4000, 4010)).toBeNull();
    expect(rangeFromDrag(4000, 4000)).toBeNull();
  });

  it("never starts before the beginning of the sequence", () => {
    expect(rangeFromDrag(-500, 4000)?.startMs).toBe(0);
  });

  it("is what dragging one edge of an existing range is built from", () => {
    // Dragging an edge anchors on the *other* edge, so the same rules apply: dragged past it the
    // range flips rather than inverting, and a drag that collapses it returns null, so the caller
    // keeps the range it had instead of ending up with one that loops without advancing.
    expect(rangeFromDrag(RANGE.endMs, 6000)).toEqual({ startMs: 6000, endMs: 8000 });
    expect(rangeFromDrag(RANGE.endMs, 9000)).toEqual({ startMs: 8000, endMs: 9000 });
    expect(rangeFromDrag(RANGE.endMs, RANGE.endMs)).toBeNull();
  });
});

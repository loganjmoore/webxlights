import { describe, expect, it } from "vitest";
import { SUBDIVISIONS, intervalAt, subdivisionMarks } from "../src/lib/timingSubdivide";

const DURATION = 10_000;

describe("the interval a moment sits in", () => {
  it("is bounded by the marks either side", () => {
    expect(intervalAt([1000, 2000, 3000], 2400, DURATION)).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("uses the ends of the sequence for the missing marks", () => {
    // A track whose marks start at the first downbeat would otherwise have an undividable head,
    // which is where the count-in usually is.
    expect(intervalAt([1000, 2000], 500, DURATION)).toEqual({ startMs: 0, endMs: 1000 });
    expect(intervalAt([1000, 2000], 5000, DURATION)).toEqual({ startMs: 2000, endMs: DURATION });
  });

  it("starts the interval at a mark directly under the playhead rather than ending it", () => {
    // Standing on a beat and dividing should subdivide the beat you are looking at - the one
    // ahead - not the one you have just played through.
    expect(intervalAt([1000, 2000], 1000, DURATION)).toEqual({ startMs: 1000, endMs: 2000 });
  });

  it("is nothing at all when there is no room", () => {
    expect(intervalAt([], 0, 0)).toBeNull();
  });
});

describe("dividing a region", () => {
  it("halves one interval", () => {
    expect(subdivisionMarks([1000, 2000], { startMs: 1000, endMs: 2000 }, 2)).toEqual([1500]);
  });

  it("divides into three and four", () => {
    expect(subdivisionMarks([], { startMs: 0, endMs: 1200 }, 3)).toEqual([400, 800]);
    expect(subdivisionMarks([], { startMs: 0, endMs: 1200 }, 4)).toEqual([300, 600, 900]);
  });

  it("divides every interval inside the region, not the region itself", () => {
    // A range covering four beats should end up with four subdivided beats. Cutting the range
    // into `parts` instead would put marks across the beats and leave the track unusable.
    const marks = [0, 1000, 2000, 3000];
    expect(subdivisionMarks(marks, { startMs: 0, endMs: 3000 }, 2)).toEqual([500, 1500, 2500]);
  });

  it("returns only the new marks", () => {
    // So the caller can tell "nothing to do" from "here is the same track back", and so one undo
    // entry covers the batch.
    expect(subdivisionMarks([500, 1000], { startMs: 0, endMs: 1000 }, 2)).toEqual([250, 750]);
  });

  it("skips an interval too short to divide, rather than dividing it as far as it goes", () => {
    // Asking for quarters and getting one mark somewhere in the middle is worse than getting
    // nothing, because it looks like it worked.
    expect(subdivisionMarks([], { startMs: 0, endMs: 100 }, 4, 50)).toEqual([]);
    // The same interval halves fine: two 50ms halves are both a whole frame.
    expect(subdivisionMarks([], { startMs: 0, endMs: 100 }, 2, 50)).toEqual([50]);
  });

  it("divides the intervals that fit and leaves the ones that don't", () => {
    // A track that is fine in places and coarse in others should get what it can take, not
    // nothing at all because one gap was tight.
    const marks = [0, 40, 1000];
    expect(subdivisionMarks(marks, { startMs: 0, endMs: 1000 }, 2, 50)).toEqual([520]);
  });

  it("refuses a division that isn't one", () => {
    expect(subdivisionMarks([], { startMs: 0, endMs: 1000 }, 1)).toEqual([]);
    expect(subdivisionMarks([], { startMs: 0, endMs: 1000 }, 0)).toEqual([]);
    expect(subdivisionMarks([], { startMs: 0, endMs: 1000 }, 2.5)).toEqual([]);
    expect(subdivisionMarks([], { startMs: 1000, endMs: 1000 }, 2)).toEqual([]);
  });

  it("never repeats a mark the track already has", () => {
    // Dividing the same region twice should be a no-op the second time, not a track with two
    // marks on the same millisecond.
    const first = subdivisionMarks([0, 1000], { startMs: 0, endMs: 1000 }, 2);
    const marks = [0, ...first, 1000].sort((a, b) => a - b);
    expect(subdivisionMarks(marks, { startMs: 0, endMs: 1000 }, 2)).toEqual([250, 750]);
    const twice = [...marks, 250, 750].sort((a, b) => a - b);
    expect(subdivisionMarks(twice, { startMs: 0, endMs: 1000 }, 2)).toEqual([125, 375, 625, 875]);
  });

  it("offers the divisions the keys are bound to", () => {
    expect([...SUBDIVISIONS]).toEqual([2, 3, 4]);
  });
});

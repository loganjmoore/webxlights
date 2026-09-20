import { describe, expect, it } from "vitest";
import { dragOutSpan, freeGapAt, marksInForce, placementFor } from "../src/lib/effectPlacement";

const DURATION = 10_000;
const DEFAULT_MS = 1000;

describe("which marks are in force", () => {
  const tracks = [
    { name: "Beats", marks: [0, 500, 1000] },
    { name: "Lyrics", marks: [0, 750] },
  ];

  it("is one track's when one is selected", () => {
    expect(marksInForce(tracks, 0)).toEqual([0, 500, 1000]);
    expect(marksInForce(tracks, 1)).toEqual([0, 750]);
  });

  it("is every track's, merged and deduped, for 'all'", () => {
    expect(marksInForce(tracks, "all")).toEqual([0, 500, 750, 1000]);
  });

  it("is nothing for a track that isn't there", () => {
    // Rather than falling back to another track's marks - placing effects against a track you
    // didn't choose is worse than placing them at the default length.
    expect(marksInForce(tracks, 5)).toEqual([]);
    expect(marksInForce([], "all")).toEqual([]);
  });

  it("sorts, so the caller can't be handed marks out of order", () => {
    expect(marksInForce([{ marks: [900, 100, 500] }], 0)).toEqual([100, 500, 900]);
  });
});

describe("where a dropped effect lands", () => {
  it("fills the interval it was dropped between", () => {
    // "Release it between two timing marks" - the whole point of the instruction. Dropping an
    // effect on a beat should give an effect that lasts that beat.
    expect(placementFor([1000, 2000, 3000], 2400, DURATION, DEFAULT_MS)).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("counts a drop exactly on a mark as being in the interval that starts there", () => {
    expect(placementFor([1000, 2000], 1000, DURATION, DEFAULT_MS)).toEqual({ startMs: 1000, endMs: 2000 });
  });

  it("fills a short interval as readily as a long one", () => {
    expect(placementFor([1000, 1120], 1050, DURATION, DEFAULT_MS)).toEqual({ startMs: 1000, endMs: 1120 });
  });

  it("grows a placement too narrow to grab, when the caller says how narrow that is", () => {
    // The sequencer passes 30px converted into milliseconds at the current zoom. A 120ms
    // interval is a comfortable target zoomed into a bar and under a pixel zoomed out to the
    // whole song, and an effect a pixel wide can't be selected, moved or deleted.
    expect(placementFor([1000, 1120], 1050, DURATION, DEFAULT_MS, 500)).toEqual({ startMs: 1000, endMs: 1500 });
    // The start stays on the mark it was dropped against - that edge is the one the drop aimed at.
    expect(placementFor([1000, 1120], 1050, DURATION, DEFAULT_MS, 50)).toEqual({ startMs: 1000, endMs: 1120 });
  });

  it("backs a widened placement off the end of the sequence rather than overrunning it", () => {
    expect(placementFor([9800, 9900], 9850, 10000, DEFAULT_MS, 400)).toEqual({ startMs: 9600, endMs: 10000 });
  });

  it("falls back to the default length with no marks at all", () => {
    // "If no timing track is selected then you can drag and drop even if you have no timing marks
    // but the effect defaults to 1 second long."
    expect(placementFor([], 2000, DURATION, DEFAULT_MS)).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("falls back before the first mark and after the last", () => {
    // Strictly "between two marks". Running to the end of the sequence past the last mark would
    // be a much worse surprise than an effect that came out a second long.
    expect(placementFor([5000, 6000], 1000, DURATION, DEFAULT_MS)).toEqual({ startMs: 1000, endMs: 2000 });
    expect(placementFor([5000, 6000], 8000, DURATION, DEFAULT_MS)).toEqual({ startMs: 8000, endMs: 9000 });
  });

  it("keeps the fallback inside the sequence", () => {
    expect(placementFor([], 9800, DURATION, DEFAULT_MS)).toEqual({ startMs: 9800, endMs: DURATION });
  });

  it("never places something too short to click on", () => {
    // A zero-length effect can't be selected on the grid, so it couldn't be removed either.
    const placed = placementFor([], DURATION, DURATION, DEFAULT_MS);
    expect(placed.endMs - placed.startMs).toBeGreaterThanOrEqual(200);
  });

  it("copes with marks handed over out of order", () => {
    expect(placementFor([3000, 1000, 2000], 2400, DURATION, DEFAULT_MS)).toEqual({ startMs: 2000, endMs: 3000 });
  });
});

describe("the free gap a span is dragged out in", () => {
  const occupied = [
    { startMs: 1000, endMs: 2000 },
    { startMs: 5000, endMs: 6000 },
  ];

  it("runs from the effect before to the effect after", () => {
    expect(freeGapAt(3000, occupied, DURATION)).toEqual({ startMs: 2000, endMs: 5000 });
  });

  it("runs to the ends of the sequence when nothing is in the way", () => {
    expect(freeGapAt(500, occupied, DURATION)).toEqual({ startMs: 0, endMs: 1000 });
    expect(freeGapAt(7000, occupied, DURATION)).toEqual({ startMs: 6000, endMs: DURATION });
    expect(freeGapAt(7000, [], DURATION)).toEqual({ startMs: 0, endMs: DURATION });
  });

  it("counts an effect that ends exactly at the press as the one before", () => {
    expect(freeGapAt(2000, occupied, DURATION)).toEqual({ startMs: 2000, endMs: 5000 });
  });
});

describe("a span dragged out on a row", () => {
  const gap = { startMs: 2000, endMs: 5000 };

  it("is the same span whichever way it was dragged", () => {
    expect(dragOutSpan(gap, 2500, 4000, 100)).toEqual({ startMs: 2500, endMs: 4000 });
    expect(dragOutSpan(gap, 4000, 2500, 100)).toEqual({ startMs: 2500, endMs: 4000 });
  });

  it("stops at its neighbours instead of covering them", () => {
    expect(dragOutSpan(gap, 3000, 9000, 100)).toEqual({ startMs: 3000, endMs: 5000 });
    expect(dragOutSpan(gap, 3000, 0, 100)).toEqual({ startMs: 2000, endMs: 3000 });
    // A snapped start can land inside the neighbour; it is pulled back to the gap's edge.
    expect(dragOutSpan(gap, 1900, 3000, 100)).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("grows a flick to the minimum, to the right first and then back off the gap's end", () => {
    expect(dragOutSpan(gap, 3000, 3010, 400)).toEqual({ startMs: 3000, endMs: 3400 });
    expect(dragOutSpan(gap, 4900, 4950, 400)).toEqual({ startMs: 4600, endMs: 5000 });
  });

  it("fills a gap narrower than the minimum rather than overflowing it", () => {
    expect(dragOutSpan({ startMs: 2000, endMs: 2100 }, 2010, 2050, 400)).toEqual({ startMs: 2000, endMs: 2100 });
  });
});

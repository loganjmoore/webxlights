import { describe, expect, it } from "vitest";
import { ALIGN_MODES, alignedTo } from "../src/lib/alignEffects";

const reference = { startMs: 2000, endMs: 3000 };

describe("aligning an effect to a reference", () => {
  it("aligns start times, keeping the effect's own length", () => {
    // An effect that silently got longer when you asked for its start to move would be a surprise
    // you'd have to undo.
    expect(alignedTo(reference, { startMs: 5000, endMs: 5500 }, "start")).toEqual({ startMs: 2000, endMs: 2500 });
  });

  it("aligns end times, keeping the length", () => {
    expect(alignedTo(reference, { startMs: 5000, endMs: 5500 }, "end")).toEqual({ startMs: 2500, endMs: 3000 });
  });

  it("aligns both, which is the one that changes the length", () => {
    // Worth having as a separate option precisely because it does something the others don't.
    expect(alignedTo(reference, { startMs: 5000, endMs: 5500 }, "both")).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("aligns centrepoints", () => {
    // The reference's centre is 2500; a 500ms effect centred there runs 2250-2750.
    expect(alignedTo(reference, { startMs: 9000, endMs: 9500 }, "center")).toEqual({ startMs: 2250, endMs: 2750 });
  });

  it("leaves an effect already in place exactly where it is", () => {
    for (const { mode } of ALIGN_MODES) {
      expect(alignedTo(reference, { ...reference }, mode)).toEqual(reference);
    }
  });

  it("never moves an effect before the start of the sequence", () => {
    // A start clamped at the front is a visible result; a negative one is an effect off the left of
    // the grid with nothing to grab.
    const early = { startMs: 0, endMs: 200 };
    const near = { startMs: 100, endMs: 5000 };
    expect(alignedTo(early, near, "end").startMs).toBe(0);
    expect(alignedTo(early, near, "center").startMs).toBe(0);
  });

  it("offers the four the manual says it does", () => {
    expect(ALIGN_MODES).toHaveLength(4);
    expect(ALIGN_MODES.map((m) => m.mode)).toEqual(["start", "end", "both", "center"]);
  });

  it("rounds to whole milliseconds", () => {
    // A centred effect can land on a half-millisecond, and a fractional start would then be
    // compared against integer timing marks forever after.
    const placed = alignedTo({ startMs: 0, endMs: 1001 }, { startMs: 8000, endMs: 8100 }, "center");
    expect(Number.isInteger(placed.startMs)).toBe(true);
    expect(Number.isInteger(placed.endMs)).toBe(true);
  });
});

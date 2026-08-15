import { describe, expect, it } from "vitest";
import { expandToMark, jumpTargetMs } from "../src/lib/expandEffect";

const marks = [0, 1000, 2000, 3000];
const DURATION = 10_000;

describe("expanding an effect to a timing mark", () => {
  it("stretches the end forward to the next mark", () => {
    expect(expandToMark({ startMs: 1200, endMs: 1500 }, marks, 1, DURATION)).toEqual({ startMs: 1200, endMs: 2000 });
  });

  it("stretches the start back to the previous mark", () => {
    expect(expandToMark({ startMs: 1200, endMs: 1500 }, marks, -1, DURATION)).toEqual({ startMs: 1000, endMs: 1500 });
  });

  it("leaves the far edge alone", () => {
    // It expands rather than moves. An effect that could shrink on this key would make the two
    // arrows a pair of nudges, which is what the plain arrows already are.
    const expanded = expandToMark({ startMs: 1200, endMs: 1500 }, marks, 1, DURATION)!;
    expect(expanded.startMs).toBe(1200);
  });

  it("goes to the next mark when it already sits on one", () => {
    // Otherwise the key would appear dead on exactly the effects most likely to be on a mark.
    expect(expandToMark({ startMs: 1000, endMs: 2000 }, marks, 1, DURATION)?.endMs).toBe(3000);
    expect(expandToMark({ startMs: 1000, endMs: 2000 }, marks, -1, DURATION)?.startMs).toBe(0);
  });

  it("runs to the end of the sequence past the last mark", () => {
    expect(expandToMark({ startMs: 4000, endMs: 5000 }, marks, 1, DURATION)?.endMs).toBe(DURATION);
  });

  it("runs to the start of the sequence before the first mark", () => {
    expect(expandToMark({ startMs: 500, endMs: 800 }, [1000, 2000], -1, DURATION)?.startMs).toBe(0);
  });

  it("is nothing when there is nowhere to go", () => {
    // Null rather than the same values back, so the caller can leave the effect alone instead of
    // rewriting it and costing an undo entry.
    expect(expandToMark({ startMs: 0, endMs: 500 }, marks, -1, DURATION)).toBeNull();
    expect(expandToMark({ startMs: 9000, endMs: DURATION }, marks, 1, DURATION)).toBeNull();
  });

  it("copes with unsorted marks", () => {
    expect(expandToMark({ startMs: 1200, endMs: 1500 }, [3000, 0, 2000, 1000], 1, DURATION)?.endMs).toBe(2000);
  });
});

describe("jumping a tenth of the way through", () => {
  it("lands on the digit's own tenth", () => {
    expect(jumpTargetMs(0, DURATION)).toBe(0);
    expect(jumpTargetMs(3, DURATION)).toBe(3000);
    expect(jumpTargetMs(9, DURATION)).toBe(9000);
  });

  it("never lands outside the sequence", () => {
    expect(jumpTargetMs(99, DURATION)).toBe(9000);
    expect(jumpTargetMs(-4, DURATION)).toBe(0);
    expect(jumpTargetMs(5, 0)).toBe(0);
  });
});

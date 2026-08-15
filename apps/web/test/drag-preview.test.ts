import { describe, expect, it } from "vitest";
import { acceptedMoves, clampBlockDelta, clampBlockRowDelta, previewMoves } from "../src/lib/dragPreview";

const DURATION = 10_000;

function dragged(id: string, startMs: number, endMs: number, rowIndex: number) {
  return { id, startMs, endMs, rowIndex };
}

describe("how far a dragged block may move", () => {
  const block = [dragged("a", 1000, 2000, 0), dragged("b", 3000, 4000, 1)];

  it("passes an ordinary delta straight through", () => {
    expect(clampBlockDelta(block, 500, DURATION)).toBe(500);
  });

  it("stops the block at the start of the sequence, not each effect separately", () => {
    // Clamping per effect would let the one that hits zero stop while the rest kept going, which
    // silently changes the spacing between them. A dragged block should stay rigid.
    expect(clampBlockDelta(block, -5000, DURATION)).toBe(-1000);
  });

  it("stops the block at the end of the sequence", () => {
    expect(clampBlockDelta(block, 9000, DURATION)).toBe(6000);
  });

  it("clamps rows the same way", () => {
    expect(clampBlockRowDelta(block, -5, 4)).toBe(0);
    expect(clampBlockRowDelta(block, 5, 4)).toBe(2);
    expect(clampBlockRowDelta(block, 1, 4)).toBe(1);
  });

  it("has nothing to clamp for an empty drag", () => {
    expect(clampBlockDelta([], 500, DURATION)).toBe(0);
    expect(clampBlockRowDelta([], 5, 4)).toBe(0);
  });
});

describe("the ghosts a drag shows", () => {
  const rowEffects = [[{ id: "a", startMs: 1000, endMs: 2000 }], [{ id: "blocker", startMs: 3000, endMs: 4000 }], []];

  it("shows where the effect will land", () => {
    const ghosts = previewMoves([dragged("a", 1000, 2000, 0)], 500, 0, rowEffects, DURATION);
    expect(ghosts[0]).toEqual({ id: "a", startMs: 1500, endMs: 2500, rowIndex: 0, blocked: false });
  });

  it("turns red when something is already there", () => {
    // "Only the ghost outlines that would collide with an existing effect turn red."
    const ghosts = previewMoves([dragged("a", 1000, 2000, 0)], 2500, 1, rowEffects, DURATION);
    expect(ghosts[0]?.blocked).toBe(true);
  });

  it("isn't blocked by where the dragged effects used to be", () => {
    // An effect can't collide with itself, and a block can't collide with its own members.
    const ghosts = previewMoves([dragged("a", 1000, 2000, 0)], 100, 0, rowEffects, DURATION);
    expect(ghosts[0]?.blocked).toBe(false);
  });

  it("treats a touching edge as butted against, not colliding", () => {
    const ghosts = previewMoves([dragged("x", 1000, 2000, 0)], 2000, 1, [[], [{ id: "b", startMs: 3000, endMs: 4000 }]], DURATION);
    expect(ghosts[0]).toMatchObject({ startMs: 3000, blocked: true });
    const clear = previewMoves([dragged("x", 1000, 2000, 0)], 1000, 1, [[], [{ id: "b", startMs: 3000, endMs: 4000 }]], DURATION);
    expect(clear[0]).toMatchObject({ startMs: 2000, endMs: 3000, blocked: false });
  });

  it("blocks some of a block while leaving the rest free", () => {
    // The whole point of the colouring: "you can see exactly which effects are blocked while the
    // rest are free to drop".
    const block = [dragged("a", 0, 500, 0), dragged("b", 0, 500, 2)];
    const rows = [[], [], [{ id: "there", startMs: 1000, endMs: 1500 }]];
    const ghosts = previewMoves(block, 1000, 0, rows, DURATION);
    expect(ghosts.map((g) => g.blocked)).toEqual([false, true]);
  });
});

describe("what actually moves on release", () => {
  it("drops the free ones and leaves the blocked ones", () => {
    const original = [dragged("a", 0, 500, 0), dragged("b", 0, 500, 1)];
    const ghosts = [
      { ...dragged("a", 1000, 1500, 0), blocked: false },
      { ...dragged("b", 1000, 1500, 1), blocked: true },
    ];
    expect(acceptedMoves(ghosts, original).map((m) => m.id)).toEqual(["a"]);
  });

  it("is nothing at all when the drag didn't move anything", () => {
    // Releasing without having moved shouldn't cost an undo entry.
    const original = [dragged("a", 0, 500, 0)];
    expect(acceptedMoves([{ ...original[0]!, blocked: false }], original)).toEqual([]);
  });

  it("counts a row change as a move even when the times didn't change", () => {
    const original = [dragged("a", 0, 500, 0)];
    expect(acceptedMoves([{ ...dragged("a", 0, 500, 2), blocked: false }], original)).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { boxFromDrag, idsInBox, isDrag, selectionAfterClick } from "../src/lib/blockSelect";

function effect(id: string, startMs: number, endMs: number) {
  return { id, startMs, endMs };
}

const rows = [
  [effect("a", 0, 1000), effect("b", 2000, 3000)],
  [effect("c", 500, 1500)],
  [],
  [effect("d", 0, 5000)],
];

describe("the box a drag draws", () => {
  it("normalises whichever way it was dragged", () => {
    expect(boxFromDrag(3000, 2, 1000, 0)).toEqual({ fromMs: 1000, toMs: 3000, fromRow: 0, toRow: 2 });
    expect(boxFromDrag(1000, 0, 3000, 2)).toEqual({ fromMs: 1000, toMs: 3000, fromRow: 0, toRow: 2 });
  });
});

describe("what a box catches", () => {
  it("takes everything it touches across the rows it covers", () => {
    // Dragging a band across the middle of a row of effects is how you select that row; requiring
    // the box to contain each one whole would mean carefully starting before the first.
    expect(idsInBox(rows, { fromMs: 800, toMs: 2500, fromRow: 0, toRow: 1 })).toEqual(["a", "b", "c"]);
  });

  it("leaves out rows the box doesn't reach", () => {
    expect(idsInBox(rows, { fromMs: 0, toMs: 5000, fromRow: 0, toRow: 0 })).toEqual(["a", "b"]);
  });

  it("leaves out effects the box doesn't reach in time", () => {
    expect(idsInBox(rows, { fromMs: 1600, toMs: 1900, fromRow: 0, toRow: 3 })).toEqual(["d"]);
  });

  it("treats a touching edge as beside the box, not in it", () => {
    // The same rule the grid already uses for whether two effects collide.
    expect(idsInBox([[effect("x", 1000, 2000)]], { fromMs: 2000, toMs: 3000, fromRow: 0, toRow: 0 })).toEqual([]);
    expect(idsInBox([[effect("x", 1000, 2000)]], { fromMs: 0, toMs: 1000, fromRow: 0, toRow: 0 })).toEqual([]);
  });

  it("copes with a box that runs off the ends of the grid", () => {
    // A drag can leave the rows entirely - past the last row, or above the first.
    expect(idsInBox(rows, { fromMs: 0, toMs: 9000, fromRow: -5, toRow: 99 })).toEqual(["a", "b", "c", "d"]);
  });

  it("catches nothing from an empty grid", () => {
    expect(idsInBox([], { fromMs: 0, toMs: 9000, fromRow: 0, toRow: 3 })).toEqual([]);
  });
});

describe("clicking an effect", () => {
  it("selects just that one", () => {
    expect(selectionAfterClick(["a", "b", "c"], "b", false)).toEqual({ selected: ["b"], reference: "b" });
  });

  it("shift-clicking inside the selection makes it the reference and keeps the block", () => {
    // "Hold down shift and click the effect you want to be the reference."
    expect(selectionAfterClick(["a", "b", "c"], "c", true)).toEqual({ selected: ["a", "b", "c"], reference: "c" });
  });

  it("shift-clicking outside the selection selects that one instead", () => {
    // More likely "I meant this one" than "align everything to something I haven't selected".
    expect(selectionAfterClick(["a", "b"], "z", true)).toEqual({ selected: ["z"], reference: "z" });
  });
});

describe("telling a drag from a click that wobbled", () => {
  it("needs real movement", () => {
    expect(isDrag(100, 100, 102, 101)).toBe(false);
    expect(isDrag(100, 100, 100, 100)).toBe(false);
  });

  it("counts movement on either axis", () => {
    expect(isDrag(100, 100, 140, 100)).toBe(true);
    expect(isDrag(100, 100, 100, 60)).toBe(true);
  });
});

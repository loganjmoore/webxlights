import { describe, expect, it } from "vitest";
import { GRID_GESTURES, gestureFor, type GestureHit, type GridGesture } from "../src/lib/gridGesture";

const plain = { shiftKey: false, hasPendingEffect: false };
const shift = { shiftKey: true, hasPendingEffect: false };
const armed = { shiftKey: false, hasPendingEffect: true };

describe("what a press on the grid means", () => {
  it("tells the two shift gestures apart by where the pointer is", () => {
    // This is the pair that collided: shift on an effect's body picks the alignment reference,
    // shift on its edge authors a fade. A rule that checks shift before it checks the edge can
    // only ever express one of them, and the one that loses stops existing silently.
    expect(gestureFor({ kind: "effect", edge: null }, shift)).toBe("pick-reference");
    expect(gestureFor({ kind: "effect", edge: "left" }, shift)).toBe("fade");
    expect(gestureFor({ kind: "effect", edge: "right" }, shift)).toBe("fade");
  });

  it("keeps the unmodified drags on the same two places", () => {
    expect(gestureFor({ kind: "effect", edge: null }, plain)).toBe("move");
    expect(gestureFor({ kind: "effect", edge: "right" }, plain)).toBe("resize");
  });

  it("adds a mark on the ruler and does nothing on a mark itself", () => {
    expect(gestureFor({ kind: "ruler-empty" }, plain)).toBe("add-mark");
    expect(gestureFor({ kind: "mark" }, plain)).toBe("none");
    // A left press on a row label does nothing: right-click there is the layer menu, and a
    // selection box starting behind the labels would be invisible.
    expect(gestureFor({ kind: "row-label" }, plain)).toBe("none");
    // Shift doesn't change either of them - there is no shift gesture up there to confuse.
    expect(gestureFor({ kind: "ruler-empty" }, shift)).toBe("add-mark");
  });

  it("draws an armed effect on empty grid, and a selection box otherwise", () => {
    expect(gestureFor({ kind: "row-empty" }, armed)).toBe("place");
    expect(gestureFor({ kind: "row-empty" }, plain)).toBe("band");
    expect(gestureFor({ kind: "none" }, plain)).toBe("band");
  });
});

describe("every gesture the grid has", () => {
  it("is reachable from some press", () => {
    // The guard the regression needed. A gesture nothing can produce is a feature that has
    // stopped existing, and the last one to do that was found by re-reading code, not by failing.
    const hits: { hit: GestureHit; modifiers: typeof plain }[] = [
      { hit: { kind: "ruler-empty" }, modifiers: plain },
      { hit: { kind: "mark" }, modifiers: plain },
      { hit: { kind: "effect", edge: null }, modifiers: shift },
      { hit: { kind: "effect", edge: "left" }, modifiers: shift },
      { hit: { kind: "effect", edge: "left" }, modifiers: plain },
      { hit: { kind: "effect", edge: null }, modifiers: plain },
      { hit: { kind: "row-empty" }, modifiers: armed },
      { hit: { kind: "row-empty" }, modifiers: plain },
    ];
    const produced = new Set<GridGesture>(hits.map(({ hit, modifiers }) => gestureFor(hit, modifiers)));
    for (const gesture of GRID_GESTURES) {
      expect(produced.has(gesture), `${gesture} is unreachable`).toBe(true);
    }
  });

  it("is one of the declared set, whatever it is handed", () => {
    for (const kind of ["effect", "mark", "ruler-empty", "row-empty", "none"] as const) {
      for (const edge of [null, "left", "right"] as const) {
        for (const modifiers of [plain, shift, armed]) {
          expect(GRID_GESTURES).toContain(gestureFor({ kind, edge }, modifiers));
        }
      }
    }
  });
});

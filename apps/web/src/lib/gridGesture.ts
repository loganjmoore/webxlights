// What a pointer press on the grid means.
//
// Extracted from the handler because the branching had grown six gestures deep and two of them
// silently collided: shift on an effect picks the alignment reference, and shift on an effect's
// *edge* authors a fade. They arrived in consecutive changes, and adding the first put an early
// return in front of the second, so the fade gesture stopped existing. Nothing failed, nothing
// warned, and no test could have caught it while the decision lived inside a pointer handler.
//
// So the decision is a function now, and the gestures are a closed set the tests can enumerate. A
// gesture that becomes unreachable is a gesture the test for it stops seeing.

export type GridGesture =
  /** Add a timing mark at the pressed position. */
  | "add-mark"
  /** A press on a mark itself - nothing on press; right-click deletes. */
  | "none"
  /** Pick the alignment reference out of the block (shift on an effect's body). */
  | "pick-reference"
  /** Shift on an effect's edge: drag inwards to set a fade. */
  | "fade"
  /** Plain drag on an effect's edge: change when the effect starts or ends. */
  | "resize"
  /** Plain drag on an effect's body: move it, and the block it belongs to. */
  | "move"
  /** Drag out a span on an empty row: the armed effect, or a placeholder and the effect picker. */
  | "place"
  /** Rubber-band a block selection (shift on a row, or below the rows). */
  | "band";

export interface GestureHit {
  kind: "effect" | "mark" | "ruler-empty" | "row-empty" | "row-label" | "none";
  /** Set when the press landed on an effect's left or right edge. */
  edge?: "left" | "right" | null;
}

export interface GestureModifiers {
  shiftKey: boolean;
}

export function gestureFor(hit: GestureHit, modifiers: GestureModifiers): GridGesture {
  if (hit.kind === "ruler-empty") return "add-mark";
  if (hit.kind === "mark") return "none";
  // A row label is the layer menu's target, and right-click is how you reach it - a left press
  // there should do nothing rather than start a selection box behind the labels.
  if (hit.kind === "row-label") return "none";

  if (hit.kind === "effect") {
    // The edge test comes first, and that ordering is the whole fix: shift means "pick the
    // reference" on the body of an effect and "author a fade" on its edge, so a rule that looks at
    // shift before it looks at where the pointer is can only ever express one of them.
    if (hit.edge) return modifiers.shiftKey ? "fade" : "resize";
    return modifiers.shiftKey ? "pick-reference" : "move";
  }

  // Adding effects is what a row is for, so the plain drag draws one out and the selection box
  // takes the modifier. It used to be the other way round, which made the common act the one that
  // needed a trip to the palette first. Shift here can't collide with the two shift gestures
  // above: those need an effect under the pointer, and this needs there to be none.
  if (hit.kind === "row-empty" && !modifiers.shiftKey) return "place";
  return "band";
}

/** Every gesture this grid has, so a test can prove each one is still reachable. */
export const GRID_GESTURES: GridGesture[] = ["add-mark", "none", "pick-reference", "fade", "resize", "move", "place", "band"];

// Selecting a block of cells on the grid (manual: Sequencer > Changing An Effect).
//
// "Drag a box around all the effects you want to align and then hold down shift and click the
// effect you want to be the reference."
//
// This is the prerequisite three separate coverage gaps turned out to share: aligning wants a box
// drawn round several effects, the ghost outline's collision colouring is described for dragging
// several at once, and the manual's own chase recipe starts "select a block of cells". A grid that
// can only ever hold one effect selected can't do any of the three.
//
// A *reference* effect as well as a selection, because aligning needs to know what to align to.
// Without one, "align these" has to pick a winner by list order, which is how you get an alignment
// that snaps everything onto whichever effect happened to be drawn first.

export interface BandBox {
  fromMs: number;
  toMs: number;
  /** Row indices, inclusive at both ends. */
  fromRow: number;
  toRow: number;
}

export interface BoxedEffect {
  id: string;
  startMs: number;
  endMs: number;
}

/** A box from two corners, in whichever order they were dragged. */
export function boxFromDrag(aMs: number, aRow: number, bMs: number, bRow: number): BandBox {
  return {
    fromMs: Math.min(aMs, bMs),
    toMs: Math.max(aMs, bMs),
    fromRow: Math.min(aRow, bRow),
    toRow: Math.max(aRow, bRow),
  };
}

/**
 * The effects a box catches, by id.
 *
 * Anything the box *touches*, not only what it encloses: dragging a band across the middle of a row
 * of effects is how you select that row, and requiring the box to contain each one whole would mean
 * carefully starting before the first and ending after the last.
 *
 * `rowEffects` is indexed by row, so an empty row is an empty array rather than a gap - the row
 * indices have to line up with the ones the box was drawn against.
 */
export function idsInBox(rowEffects: readonly (readonly BoxedEffect[])[], box: BandBox): string[] {
  const ids: string[] = [];
  for (let row = Math.max(0, box.fromRow); row <= Math.min(rowEffects.length - 1, box.toRow); row++) {
    for (const effect of rowEffects[row] ?? []) {
      // Touching edges don't count: an effect ending exactly where the box starts is beside it,
      // not in it, which is the same rule the grid already uses for whether two effects collide.
      if (effect.startMs < box.toMs && effect.endMs > box.fromMs) ids.push(effect.id);
    }
  }
  return ids;
}

/**
 * How a click changes the selection.
 *
 * Shift picks the reference out of a selection that already exists - "hold down shift and click the
 * effect you want to be the reference" - and only then, because shift-clicking an effect outside
 * the selection more likely means "I meant this one" than "align everything to something I haven't
 * selected".
 */
export function selectionAfterClick(
  selected: readonly string[],
  clickedId: string,
  shiftKey: boolean,
): { selected: string[]; reference: string | null } {
  if (shiftKey && selected.includes(clickedId)) return { selected: [...selected], reference: clickedId };
  return { selected: [clickedId], reference: clickedId };
}

/** Whether a drag has moved far enough to be a box rather than a click that wobbled. */
export function isDrag(fromX: number, fromY: number, toX: number, toY: number, thresholdPx = 4): boolean {
  return Math.abs(toX - fromX) > thresholdPx || Math.abs(toY - fromY) > thresholdPx;
}

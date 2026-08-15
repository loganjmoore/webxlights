// The ghost outline shown while dragging (manual: Sequencer > Changing An Effect).
//
// "While you drag, a 'ghost' outline follows the cursor to show where the effect (or effects) will
// land when you release the mouse button." / "When dragging several effects at once, only the
// ghost outlines that would collide with an existing effect turn red, so you can see exactly which
// effects are blocked while the rest are free to drop."
//
// Two things follow from that second sentence, and they are why this needed the drag rewritten
// rather than a rectangle drawn over the old one:
//
//   - A drag is a *proposal* until the mouse is released. Ours committed on every pointermove,
//     which is why it needed a snapshot guard to stop the undo stack filling with drag frames, and
//     why there was nothing to show a ghost of - the effect was already there.
//   - Blocked and free effects release differently. The ones that fit drop; the ones that don't
//     stay where they were. Refusing the whole drag because one of twelve effects overlapped would
//     make block dragging useless on a busy row.

export interface DraggedEffect {
  id: string;
  startMs: number;
  endMs: number;
  rowIndex: number;
}

export interface GhostPlacement extends DraggedEffect {
  /** Something is already there, so this one won't drop. Drawn red. */
  blocked: boolean;
}

export interface RowEffect {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * How far a block may actually move, given where its own edges are.
 *
 * Clamped for the block as a whole rather than per effect: clamping each one separately would let
 * the effect that hits the start of the sequence stop while the rest kept going, quietly changing
 * the spacing between them. A dragged block should stay rigid.
 */
export function clampBlockDelta(dragged: readonly DraggedEffect[], deltaMs: number, durationMs: number): number {
  if (dragged.length === 0) return 0;
  const earliest = Math.min(...dragged.map((d) => d.startMs));
  const latest = Math.max(...dragged.map((d) => d.endMs));
  return Math.round(Math.max(-earliest, Math.min(deltaMs, Math.max(0, durationMs - latest))));
}

/** The same, for vertical movement across rows. */
export function clampBlockRowDelta(dragged: readonly DraggedEffect[], deltaRows: number, rowCount: number): number {
  if (dragged.length === 0) return 0;
  const topmost = Math.min(...dragged.map((d) => d.rowIndex));
  const lowest = Math.max(...dragged.map((d) => d.rowIndex));
  const clamped = Math.max(-topmost, Math.min(deltaRows, Math.max(0, rowCount - 1 - lowest)));
  // Normalised, because clamping against a block already at row 0 produces -0, which compares
  // unequal to 0 under Object.is and would make "did this drag move anything" answer wrongly.
  return clamped === 0 ? 0 : clamped;
}

/**
 * Where each dragged effect would land, and whether anything is in the way.
 *
 * `rowEffects` is indexed by row and holds what is already on the grid; the dragged effects are
 * ignored when testing for collisions, since an effect can't be blocked by where it used to be.
 */
export function previewMoves(
  dragged: readonly DraggedEffect[],
  deltaMs: number,
  deltaRows: number,
  rowEffects: readonly (readonly RowEffect[])[],
  durationMs: number,
): GhostPlacement[] {
  const dMs = clampBlockDelta(dragged, deltaMs, durationMs);
  const dRow = clampBlockRowDelta(dragged, deltaRows, rowEffects.length);
  const moving = new Set(dragged.map((d) => d.id));

  return dragged.map((effect) => {
    const startMs = effect.startMs + dMs;
    const endMs = effect.endMs + dMs;
    const rowIndex = effect.rowIndex + dRow;
    const occupants = rowEffects[rowIndex] ?? [];
    // Touching edges don't collide: an effect ending exactly where another starts is butted
    // against it, which is the same rule the keyboard move already uses.
    const blocked = occupants.some((o) => !moving.has(o.id) && startMs < o.endMs && endMs > o.startMs);
    return { id: effect.id, startMs, endMs, rowIndex, blocked };
  });
}

/**
 * The moves that actually happen on release.
 *
 * Blocked ghosts are dropped rather than the whole drag being refused, which is what "the rest are
 * free to drop" means. A move that changes nothing is dropped too, so releasing without having
 * moved doesn't cost an undo entry.
 */
export function acceptedMoves(ghosts: readonly GhostPlacement[], original: readonly DraggedEffect[]): DraggedEffect[] {
  const before = new Map(original.map((d) => [d.id, d]));
  return ghosts
    .filter((g) => !g.blocked)
    .filter((g) => {
      const was = before.get(g.id);
      return !was || was.startMs !== g.startMs || was.rowIndex !== g.rowIndex;
    })
    .map(({ id, startMs, endMs, rowIndex }) => ({ id, startMs, endMs, rowIndex }));
}

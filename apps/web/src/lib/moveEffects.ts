import type { RowElementType, SequenceEffect } from "./api";

// Moving effects with the arrow keys (manual: Sequencer > Changing An Effect).
//
// "You can also select the effect and use the Left or Right arrow keys to move it left or right.
// When the effect encounters or is blocked by another effect, if you keep going, it will jump over
// the effect/effects and continue past." The same for Up and Down between model rows.
//
// The jumping is the part worth getting right. The obvious implementation stops dead at a
// neighbour, which makes the keyboard useless exactly where it is most wanted - a row packed with
// effects is where dragging with a mouse is hardest.

export interface MovedEffect {
  startMs: number;
  endMs: number;
}

/**
 * Where an effect lands when nudged along its own row.
 *
 * Returns null when it cannot move: off the front of the sequence, or past the end. A null is the
 * honest answer for "there is nowhere to go", and leaves the effect where it is rather than
 * clamping it onto a neighbour.
 */
export function moveEffectInTime(
  effects: readonly SequenceEffect[],
  id: string,
  direction: -1 | 1,
  stepMs: number,
  durationMs: number,
): MovedEffect | null {
  const effect = effects.find((e) => e.id === id);
  if (!effect) return null;

  const length = effect.endMs - effect.startMs;
  const others = effects.filter((e) => e.id !== id).sort((a, b) => a.startMs - b.startMs);

  let start = effect.startMs + direction * stepMs;

  // Keep jumping while something is in the way: several effects packed together are jumped as a
  // group, which is what "jump over the effect/effects" means.
  for (let guard = 0; guard < others.length + 1; guard++) {
    const blocker = others.find((o) => start < o.endMs && start + length > o.startMs);
    if (!blocker) break;
    start = direction === 1 ? blocker.endMs : blocker.startMs - length;
  }

  if (start < 0) return null;
  if (start + length > durationMs) return null;
  return { startMs: start, endMs: start + length };
}

export interface RowRef {
  elementType: RowElementType;
  elementId: number;
  subName?: string;
}

/**
 * The row an effect lands on when nudged up or down, or null at the ends.
 *
 * Vertical movement keeps the effect's time and changes only which prop plays it, which is what
 * makes it useful for copying a look from one prop to the next.
 */
export function moveEffectToRow(rows: readonly RowRef[], current: RowRef, direction: -1 | 1): RowRef | null {
  const index = rows.findIndex(
    (r) => r.elementType === current.elementType && r.elementId === current.elementId && (r.subName ?? "") === (current.subName ?? ""),
  );
  if (index < 0) return null;
  // Up on the screen is the row above, which is the earlier index - the grid draws rows top-down
  // even though the render buffer doesn't.
  const target = rows[index + direction];
  return target ?? null;
}

/**
 * Whether an effect would fit on a row at a given time.
 *
 * Used before a vertical move: xLights jumps over blockers horizontally, but a vertical move onto
 * an occupied slot has nowhere to jump to, so it is refused rather than left overlapping.
 */
export function fitsOnRow(effects: readonly SequenceEffect[], startMs: number, endMs: number): boolean {
  return !effects.some((e) => startMs < e.endMs && endMs > e.startMs);
}

// Where a dropped effect starts and ends (manual: Sequencer > Adding An Effect).
//
// "Click on the effect from the effects toolbar and drag the effect to the grid and release it
// between two timing marks on the row of the model you wish the effect to play on... If no timing
// track is selected then you can drag and drop even if you have no timing marks but the effect
// defaults to 1 second long."
//
// Which says the thing we had backwards: the fixed length is the *fallback*. Releasing between two
// marks fills the interval between them, and that is the whole reason the instruction is phrased
// as "between two timing marks" - dropping an effect on a beat should give you an effect that
// lasts that beat, not one that lasts a second and has to be dragged to fit.
//
// The manual's phrasing also carries the notion of a *selected* timing track: which marks are in
// force is a choice, not the union of every track. A show with a Beats track and a Lyrics track
// would otherwise place effects into the intersection of the two, which is finer than either and
// belongs to neither.

export interface Placement {
  startMs: number;
  endMs: number;
}

/** The marks in force: one track's, or every track's merged when "all" is chosen. */
export function marksInForce(tracks: readonly { marks: number[] }[], active: number | "all"): number[] {
  if (active === "all") return [...new Set(tracks.flatMap((t) => t.marks))].sort((a, b) => a - b);
  return [...(tracks[active]?.marks ?? [])].sort((a, b) => a - b);
}

/**
 * Where an effect dropped at a moment should start and end.
 *
 * Fills the interval when the drop lands between two marks; falls back to `defaultMs` when it
 * doesn't - before the first mark, after the last, or with no marks at all.
 *
 * Strictly "between two marks", so a drop past the last mark gets the default rather than running
 * to the end of the sequence: an effect that silently stretched to the end of the song is a much
 * worse surprise than one that came out a second long.
 */
export function placementFor(
  marks: readonly number[],
  atMs: number,
  durationMs: number,
  defaultMs: number,
  // Defaults to no floor, so a caller that doesn't measure pixels keeps filling an interval
  // exactly - "release it between two timing marks" means that interval, however short it is.
  // Only the sequencer, which knows the zoom, asks for a minimum.
  minimumMs = 0,
): Placement {
  // Sorted here rather than assumed: a track's marks are kept in order, but a caller passing an
  // unsorted list would silently get the wrong interval rather than an error.
  const sorted = [...marks].sort((a, b) => a - b);
  const before = sorted.filter((m) => m <= atMs).pop();
  const after = sorted.find((m) => m > atMs);
  if (before !== undefined && after !== undefined) return widened({ startMs: before, endMs: after }, durationMs, minimumMs);

  // The fallback still has to land inside the sequence, and still has to be long enough to be
  // selectable - a zero-length effect can't be clicked, so it couldn't be removed either.
  const floor = Math.max(minimumMs, MINIMUM_MS);
  const startMs = Math.max(0, Math.min(atMs, Math.max(0, durationMs - floor)));
  const endMs = Math.min(Math.max(startMs + defaultMs, startMs + floor), Math.max(durationMs, startMs + floor));
  return { startMs, endMs };
}

/**
 * The free span around a moment on a row: from the effect before it to the effect after it.
 *
 * What a span dragged out on the grid is kept inside. Drawing a new effect across the one next
 * door would bury part of it, and refusing the drag outright would throw away a gesture that was
 * almost right - stopping at the neighbour's edge is what the drag was aiming for anyway.
 */
export function freeGapAt(atMs: number, occupied: readonly Placement[], durationMs: number): Placement {
  return {
    startMs: Math.max(0, ...occupied.filter((o) => o.endMs <= atMs).map((o) => o.endMs)),
    endMs: Math.min(durationMs, ...occupied.filter((o) => o.startMs >= atMs).map((o) => o.startMs)),
  };
}

/**
 * The span a drag from one moment to another draws out, in either direction, inside its gap.
 *
 * Floored at `minimumMs` for the reason a drop is (see `widened`): a flick that lands something
 * two pixels wide leaves an effect that can't be got hold of again. The floor gives way to the
 * gap, though - a gap narrower than the minimum is filled, not overflowed.
 */
export function dragOutSpan(gap: Placement, fromMs: number, toMs: number, minimumMs: number): Placement {
  const within = (ms: number) => Math.max(gap.startMs, Math.min(ms, gap.endMs));
  const startMs = Math.min(within(fromMs), within(toMs));
  const endMs = Math.max(within(fromMs), within(toMs));
  if (endMs - startMs >= minimumMs) return { startMs, endMs };
  const grownEnd = Math.min(startMs + minimumMs, gap.endMs);
  return { startMs: Math.max(gap.startMs, grownEnd - minimumMs), endMs: grownEnd };
}

/**
 * Grows a placement that would come out too small to grab.
 *
 * The caller passes the minimum in milliseconds, but the number it cares about is a number of
 * *pixels* - see `minimumEffectMs` in SequencerPage. A fixed millisecond floor can't express
 * that, because how wide 200ms looks depends entirely on the zoom: zoomed out to see a whole
 * song it is under a pixel, and an effect you can't see is one you can't select, move or delete.
 *
 * It grows to the right, so the start stays on the mark it was dropped against - that edge is
 * the one the drop was aimed at. Only when there is no room left does it back up off the end of
 * the sequence.
 */
function widened(p: Placement, durationMs: number, minimumMs: number): Placement {
  const floor = Math.max(minimumMs, 1);
  if (p.endMs - p.startMs >= floor) return p;
  const endMs = Math.min(p.startMs + floor, Math.max(durationMs, floor));
  return { startMs: Math.max(0, endMs - floor), endMs };
}

/** Short enough to be a deliberate choice, long enough to be worth storing. */
const MINIMUM_MS = 200;

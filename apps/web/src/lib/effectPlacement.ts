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
export function placementFor(marks: readonly number[], atMs: number, durationMs: number, defaultMs: number): Placement {
  // Sorted here rather than assumed: a track's marks are kept in order, but a caller passing an
  // unsorted list would silently get the wrong interval rather than an error.
  const sorted = [...marks].sort((a, b) => a - b);
  const before = sorted.filter((m) => m <= atMs).pop();
  const after = sorted.find((m) => m > atMs);
  if (before !== undefined && after !== undefined) return { startMs: before, endMs: after };

  // The fallback still has to land inside the sequence, and still has to be long enough to be
  // selectable - a zero-length effect can't be clicked, so it couldn't be removed either.
  const startMs = Math.max(0, Math.min(atMs, Math.max(0, durationMs - MINIMUM_MS)));
  const endMs = Math.min(Math.max(startMs + defaultMs, startMs + MINIMUM_MS), Math.max(durationMs, startMs + MINIMUM_MS));
  return { startMs, endMs };
}

/** Short enough to be a deliberate choice, long enough to be clickable on the grid. */
const MINIMUM_MS = 200;

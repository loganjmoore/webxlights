// Dividing timing marks (manual: Sequencer > Shortcuts > Dividing Timings).
//
// "Keyboard shortcuts are available to divide the selected timing marks by predefined intervals,
// making it quick to build up subdivided timing tracks."
//
// That one sentence is the whole of what the manual says, and it names neither the keys nor the
// intervals - so both are chosen here rather than copied. The intervals are 2, 3 and 4, on the
// number keys of the same name: halving is the common case (a beat track becomes an eighth-note
// track), thirds are what a waltz or a triplet fill needs, and quarters save doing the halving
// twice. Anything finer is two presses away.
//
// "The selected timing marks" is the part that needs translating, because there is no multi-mark
// selection on our ruler. There is already a highlighted region though - the play range - and it
// is exactly the "this bit, here" gesture this wants. So: with a range marked, every interval
// inside it is divided at once; without one, the single interval the playhead sits in is.

export const SUBDIVISIONS = [2, 3, 4] as const;
export type Subdivision = (typeof SUBDIVISIONS)[number];

export interface Region {
  startMs: number;
  endMs: number;
}

/**
 * The interval a moment sits in, bounded by the marks either side.
 *
 * The ends of the sequence stand in for the missing marks, so the first and last intervals can be
 * divided too - a track whose marks start at the first downbeat would otherwise have an
 * undividable head, which is where the count-in usually is.
 *
 * A mark exactly under the playhead starts the interval rather than ending it: standing on a beat
 * and dividing should subdivide the beat you are looking at, which is the one ahead.
 */
export function intervalAt(marks: readonly number[], atMs: number, durationMs: number): Region | null {
  let startMs = 0;
  let endMs = durationMs;
  for (const mark of marks) {
    if (mark <= atMs && mark > startMs) startMs = mark;
    if (mark > atMs && mark < endMs) endMs = mark;
  }
  return endMs > startMs ? { startMs, endMs } : null;
}

/**
 * The marks that divide every interval within a region into `parts`, as marks to add.
 *
 * Returns only the new ones rather than a merged list, so the caller can tell "nothing to do" from
 * "here is the same track back" - and so one undo entry covers the batch.
 *
 * `minimumMs` is the sequence's frame length at the call sites: a mark landing between two frames
 * is one nothing can ever be placed against, and dividing an already-fine track by four is exactly
 * how you would produce a dozen of them.
 */
export function subdivisionMarks(marks: readonly number[], region: Region, parts: number, minimumMs = 1): number[] {
  if (!Number.isInteger(parts) || parts < 2 || region.endMs <= region.startMs) return [];

  // The existing marks inside the region become interior boundaries, so a range covering four
  // beats divides each of them rather than cutting the range itself into `parts`.
  const inside = marks.filter((m) => m > region.startMs && m < region.endMs);
  const boundaries = [...new Set([region.startMs, ...inside, region.endMs])].sort((a, b) => a - b);

  const existing = new Set(marks);
  const added = new Set<number>();
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const from = boundaries[i]!;
    const to = boundaries[i + 1]!;
    const step = (to - from) / parts;
    // An interval too short to divide is skipped whole, rather than divided as far as it will go:
    // asking for quarters and getting a single mark somewhere in the middle is a worse answer than
    // getting nothing, because it looks like it worked.
    if (step < minimumMs) continue;
    for (let n = 1; n < parts; n++) {
      const ms = Math.round(from + n * step);
      if (existing.has(ms) || added.has(ms)) continue;
      added.add(ms);
    }
  }
  return [...added].sort((a, b) => a - b);
}

import type { SequenceEffect, TimingTrack } from "./api";

// xLights' Song Structure Regions (manual: Sequencer > Song Structure Regions): they "let you
// divide the sequence timeline into named, colored sections - for example Intro, Verse, Chorus,
// Bridge and Outro".
//
// They earn their keep through what they make possible in bulk. Once the timeline is labelled,
// "copy the chorus's effects onto the second chorus" is a single action instead of a rubber-band
// selection across a hundred rows that has to land on exactly the right boundary.
//
// Stored as boundaries rather than as start/end pairs. A region ends where the next begins, so
// keeping both would let the two disagree - and a gap or an overlap between two regions is not a
// state the timeline can actually be in.

export interface SongBoundary {
  ms: number;
  name: string;
}

export interface SongRegion {
  name: string;
  startMs: number;
  endMs: number;
  /** Index into REGION_COLORS - assigned by position, so neighbours never share a colour. */
  colorIndex: number;
}

// The palette regions are coloured from. Deliberately muted: these sit behind the effect grid,
// and a saturated band would compete with the effects drawn on top of it.
export const REGION_COLORS = ["#3a4a63", "#4a3a63", "#63523a", "#3a6352", "#633a4a", "#525a3a"];

/**
 * Turns a boundary list into the regions it describes.
 *
 * The last region runs to the end of the sequence; a boundary past the end is dropped, since a
 * region starting after the music has finished can't contain anything.
 */
export function regionsFrom(boundaries: SongBoundary[], durationMs: number): SongRegion[] {
  const sorted = [...boundaries]
    .filter((b) => Number.isFinite(b.ms) && b.ms >= 0 && b.ms < durationMs)
    .sort((a, b) => a.ms - b.ms);
  if (sorted.length === 0) return [];

  return sorted.map((boundary, i) => ({
    name: boundary.name,
    startMs: boundary.ms,
    endMs: sorted[i + 1]?.ms ?? durationMs,
    colorIndex: i % REGION_COLORS.length,
  }));
}

/** The region a moment falls in, if any. */
export function regionAt(regions: SongRegion[], ms: number): SongRegion | undefined {
  return regions.find((r) => ms >= r.startMs && ms < r.endMs);
}

/**
 * Builds regions from a timing track: "one region for each timing mark, using the timing mark's
 * label as the region name".
 *
 * Marks without a label are named by their position rather than left blank, because an unnamed
 * region is indistinguishable from its neighbours in the one place regions are meant to help.
 */
export function boundariesFromTimingTrack(track: TimingTrack): SongBoundary[] {
  // Paired *before* sorting: a label belongs to the mark it was authored against, which is its
  // position in the track's own array. Sorting first and then indexing the labels would hand
  // "Chorus" to whichever mark happened to be earliest, which is only the same thing when the
  // track was already in order.
  return track.marks
    .map((ms, i) => ({ ms, name: track.labels?.[i]?.trim() ?? "", index: i }))
    .sort((a, b) => a.ms - b.ms)
    .map((entry, position) => ({ ms: entry.ms, name: entry.name || `Section ${position + 1}` }));
}

/**
 * The effects of a row that fall inside a region.
 *
 * "Falls inside" means the effect *starts* in it. An effect straddling a boundary belongs to the
 * region it began in - splitting it would change what the sequence renders, and counting it in
 * both would duplicate it on every copy.
 */
export function effectsInRegion(effects: SequenceEffect[], region: SongRegion): SequenceEffect[] {
  return effects.filter((e) => e.startMs >= region.startMs && e.startMs < region.endMs);
}

/**
 * The effects to write when copying one region's contents onto another.
 *
 * Times are rebased on the target's start, so a chorus copied onto a later chorus lands in step
 * with it rather than at the same absolute moment. Anything that would run past the target's end
 * is dropped rather than trimmed: a half-length copy of an effect is a different effect, and
 * silently shortening one is worse than not copying it.
 */
export function rebaseEffects(
  effects: SequenceEffect[],
  from: SongRegion,
  to: SongRegion,
  newId: () => string,
): SequenceEffect[] {
  const shift = to.startMs - from.startMs;
  return effects
    .map((e) => ({ ...JSON.parse(JSON.stringify(e)) as SequenceEffect, id: newId(), startMs: e.startMs + shift, endMs: e.endMs + shift }))
    .filter((e) => e.endMs <= to.endMs);
}

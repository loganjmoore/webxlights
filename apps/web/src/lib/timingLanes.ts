// Labelled timing tracks as pinned lanes, the way xLights shows them above the effects grid.
//
// Tracks are flat in the body: breaking a lyric down makes sibling tracks named for the one it
// came from ("Lyrics", "Lyrics — Words", "Lyrics — Phonemes", or "<voice> — Phrases" first from a
// Papagayo import). The grid wants them as one stack, phrases over words over phonemes, so you can
// read a line and see each word's mouth shapes under it, lined up with the effects below. The
// names are the only link between the three, so the grouping is done here, by name, and nowhere
// else needs to know the convention.

import type { TimingTrack } from "./api";

export type LaneLayer = "phrases" | "words" | "phonemes";

export interface LaneCell {
  startMs: number;
  endMs: number;
  label: string;
}

export interface TimingLane {
  /** Index into the body's timingTracks: what a double-click or a right-click acts on. */
  trackIndex: number;
  /** Gutter text: the track's name, or just "Words" / "Phonemes" for a sibling under its phrases. */
  title: string;
  /** 0 for a track on its own or a lyric's phrases, 1 for the words and phonemes tucked under. */
  depth: number;
  layer: LaneLayer;
  /** Only the cells with something to show; a rest or an unlabelled cell is a gap in the lane. */
  cells: LaneCell[];
  /** The track's own marks, copied so the grid can hit-test without reading the reactive body. */
  marks: number[];
}

const WORDS_SUFFIX = " — Words";
const PHONEMES_SUFFIX = " — Phonemes";
const PHRASES_SUFFIX = " — Phrases";

/** A cell runs from a mark to the next; "rest" is how xLights writes silence between phonemes. */
function laneCells(track: TimingTrack): LaneCell[] {
  const cells: LaneCell[] = [];
  for (let i = 0; i < track.marks.length - 1; i++) {
    const label = track.labels?.[i]?.trim() ?? "";
    const startMs = track.marks[i]!;
    const endMs = track.marks[i + 1]!;
    // A zero-width cell has nowhere to be drawn or hit, and one out of order would break the
    // binary search the grid does over a lane's cells.
    if (!label || label.toLowerCase() === "rest" || endMs <= startMs) continue;
    cells.push({ startMs, endMs, label });
  }
  return cells;
}

function hasLabel(track: TimingTrack): boolean {
  return (track.labels ?? []).some((l) => l.trim() !== "");
}

/** The name a lyric's sibling tracks hang off: "Voice — Phrases" and "Voice" are both "Voice". */
function baseName(name: string): string {
  return name.endsWith(PHRASES_SUFFIX) ? name.slice(0, -PHRASES_SUFFIX.length) : name;
}

/** Which layer a track is, and the base name it belongs to when it is a Words or Phonemes sibling. */
function siblingOf(name: string): { layer: "words" | "phonemes"; base: string } | null {
  if (name.endsWith(WORDS_SUFFIX)) return { layer: "words", base: name.slice(0, -WORDS_SUFFIX.length) };
  if (name.endsWith(PHONEMES_SUFFIX)) return { layer: "phonemes", base: name.slice(0, -PHONEMES_SUFFIX.length) };
  return null;
}

/**
 * The lanes to pin above the grid: one per track that has any label, a lyric's words and phonemes
 * directly after its phrases, everything else in the body's order.
 *
 * A Words or Phonemes track whose phrases are gone (deleted, or never imported) is still worth
 * reading, so it takes its own place in the order rather than vanishing with its parent.
 */
export function timingLanes(tracks: readonly TimingTrack[]): TimingLane[] {
  const byName = new Map<string, number>();
  tracks.forEach((t, i) => {
    if (!byName.has(t.name)) byName.set(t.name, i);
  });
  const hasPhrases = (base: string): boolean => byName.has(base) || byName.has(base + PHRASES_SUFFIX);

  const lanes: TimingLane[] = [];
  const placed = new Set<number>();
  const place = (trackIndex: number, title: string, layer: LaneLayer): void => {
    const track = tracks[trackIndex]!;
    if (placed.has(trackIndex)) return;
    placed.add(trackIndex);
    if (!hasLabel(track)) return;
    lanes.push({ trackIndex, title, depth: layer === "phrases" ? 0 : 1, layer, cells: laneCells(track), marks: [...track.marks] });
  };

  tracks.forEach((track, i) => {
    const sibling = siblingOf(track.name);
    // Its phrases will place it, in order, when they come round.
    if (sibling && hasPhrases(sibling.base)) return;
    if (sibling) {
      place(i, sibling.layer === "words" ? "Words" : "Phonemes", sibling.layer);
      return;
    }
    const base = baseName(track.name);
    place(i, base, "phrases");
    for (const [suffix, title, layer] of [
      [WORDS_SUFFIX, "Words", "words"],
      [PHONEMES_SUFFIX, "Phonemes", "phonemes"],
    ] as const) {
      const at = byName.get(base + suffix);
      if (at !== undefined) place(at, title, layer);
    }
  });
  return lanes;
}

/** The index of the first cell that ends after `ms`, or cells.length: cells are in time order. */
export function firstCellEndingAfter(cells: readonly LaneCell[], ms: number): number {
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cells[mid]!.endMs > ms) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The cell holding `ms`. A cell is half-open, so a boundary belongs to the cell that starts there. */
export function cellAt(cells: readonly LaneCell[], ms: number): LaneCell | undefined {
  const cell = cells[firstCellEndingAfter(cells, ms)];
  return cell && cell.startMs <= ms ? cell : undefined;
}

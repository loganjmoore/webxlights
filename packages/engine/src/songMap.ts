// What Magic Sequence knows about a song: where the beats and bars are, how the song is laid out
// in sections, how loud it is from beat to beat, and where the drums hit. Everything downstream
// (the director, the choreographer, the score) reads this and never touches audio again.
//
// Plain numbers and arrays only, no typed arrays, so a SongMap survives JSON.stringify and can
// be cached on the sequence next to the audio it was made from (docs/MAGIC-SEQUENCE.md 2.1).

export type SectionLabel = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "breakdown" | "solo" | "outro";

export interface SongSection {
  /** Snapped to downbeats, and to 4-bar phrases where the song has them. The first starts at 0, the last ends at durationMs, and they are contiguous. */
  startMs: number;
  endMs: number;
  label: SectionLabel;
  /** Repeat class "A", "B", "C"...: sections with the same group sound alike. */
  group: string;
  /** 0..1, the mean of the per-beat energy curve over the section. */
  energy: number;
  /** Energy rank among the sections, 0 = loudest. */
  rank: number;
}

export interface SongHit {
  ms: number;
  strength: number;
  band: "kick" | "snare" | "hat" | "full";
}

export interface SongMap {
  version: 1;
  durationMs: number;
  bpm: number;
  /** ms, ascending. */
  beats: number[];
  /** ms, the first beat of each bar. A subset of `beats`. */
  downbeats: number[];
  /** 4 unless detection is confident otherwise. */
  beatsPerBar: number;
  sections: SongSection[];
  /** One value per beat (same length as `beats`), 0..1, relative to the song itself. */
  energy: number[];
  hits: SongHit[];
  /** ms: sudden energy jumps and drops. */
  impacts: number[];
  /** 0..1 each. How far to trust the beat grid and the section boundaries. */
  confidence: { beats: number; sections: number };
  source: "browser" | "pro";
}

export interface SongAnalysisProgress {
  (fraction: number, step: string): void;
}

export { analyzeSong } from "./songAnalysis";

/** The index of the last beat at or before `ms`, or -1 before the first beat. */
export function beatIndexAt(map: Pick<SongMap, "beats">, ms: number): number {
  const beats = map.beats;
  let lo = 0;
  let hi = beats.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * The section playing at `ms`, or undefined for a map with none.
 *
 * Sections are contiguous from 0 to the duration, so any time inside the song has one; a time
 * past the end gets the last section and a negative time the first, which is what a caller
 * clamping a playhead wants.
 */
export function sectionAt(map: Pick<SongMap, "sections">, ms: number): SongSection | undefined {
  const sections = map.sections;
  if (sections.length === 0) return undefined;
  for (const section of sections) {
    if (ms < section.endMs) return section;
  }
  return sections[sections.length - 1];
}

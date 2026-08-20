// Lyric timing tracks (manual: Sequencer > Singing Faces).
//
// A lyric track is a timing track whose marks carry text, broken down twice:
//
//   "Breakdown all the phrases into words by right clicking on the timing track ... and selecting
//    the Breakdown Phrases option."
//   "Break down all the words into phonemes by ... selecting the Breakdown Words option."
//
// giving three levels - phrases, words, phonemes - with each generated "just below" the one it
// came from. The phoneme level is what a Faces effect reads to drive a singing face; the phrase
// and word levels are there to type into and to edit against.
//
// xLights nests the three inside one track. This app's timing tracks are flat, so a breakdown
// produces sibling tracks named for their level - exactly what the Papagayo import already does
// (papagayoTiming.ts), so a typed lyric and an imported one end up in the same shape.

import { STANDARD_PHONEMES } from "@webxlights/engine";
import type { TimingTrack } from "./api";

export interface Cell {
  startMs: number;
  endMs: number;
  label: string;
}

/**
 * How a word's letters map onto Preston Blair mouth shapes.
 *
 * xLights looks words up in a real phonetic dictionary and, when a word isn't in it, produces
 * nothing at all - "occasionally you may see that there is no phonetic breakdown of the word
 * placed in the timing track" - leaving you to add it through the User Library dialog.
 *
 * This is a letter-based approximation instead, and it is worth being plain that it is one: it
 * gets the mouth opening and closing on roughly the right sounds, which is most of what reads as
 * singing at yard distance, but it is not the dictionary's answer and will differ on any word
 * whose spelling and pronunciation disagree. The trade is that every word breaks down rather than
 * silently producing an empty track, which is the failure that is hard to notice.
 */
const LETTER_PHONEMES: Record<string, string> = {
  a: "AI",
  i: "AI",
  e: "E",
  o: "O",
  u: "U",
  y: "E",
  m: "MBP",
  b: "MBP",
  p: "MBP",
  f: "FV",
  v: "FV",
  l: "L",
  w: "WQ",
  q: "WQ",
};

/** The shape a letter makes, or the catch-all consonant shape. */
function phonemeForLetter(letter: string): string {
  return LETTER_PHONEMES[letter] ?? "etc";
}

/**
 * The phonemes a word breaks into.
 *
 * Runs of the same shape collapse: "keep" is K-E-E-P, not K-E-E-E-P, because a mouth holding one
 * shape for two frames is one visible shape, and a phoneme per letter makes a face chatter at
 * spelling rather than at speech. A word with no letters at all still gets a shape, so a cell
 * never comes out empty.
 */
export function phonemesForWord(word: string): string[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length === 0) return ["rest"];
  const out: string[] = [];
  for (const letter of letters) {
    const phoneme = phonemeForLetter(letter);
    if (out[out.length - 1] !== phoneme) out.push(phoneme);
  }
  return out;
}

/**
 * Splits a span into cells, weighted so longer pieces get longer.
 *
 * Even division would give "I" and "everything" the same time, which reads as a stutter followed
 * by a rush. Weighting by length is a crude stand-in for how long a word actually takes to sing,
 * and it is the same rule at both levels.
 */
function slice(items: string[], startMs: number, endMs: number): Cell[] {
  const span = Math.max(endMs - startMs, 0);
  const weights = items.map((s) => Math.max(s.replace(/[^a-z]/gi, "").length, 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const cells: Cell[] = [];
  let at = startMs;
  items.forEach((label, i) => {
    // The last cell takes whatever is left, so rounding can't leave a gap before the next phrase.
    const end = i === items.length - 1 ? endMs : Math.round(at + (span * weights[i]!) / total);
    cells.push({ startMs: at, endMs: end, label });
    at = end;
  });
  return cells;
}

/** The words of a phrase, laid out across the phrase's own span. */
export function breakdownPhrase(text: string, startMs: number, endMs: number): Cell[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  return slice(words, startMs, endMs);
}

/** The phonemes of a word, laid out across the word's own span. */
export function breakdownWord(word: string, startMs: number, endMs: number): Cell[] {
  const phonemes = phonemesForWord(word);
  return slice(phonemes, startMs, endMs).map((cell, i) => ({ ...cell, label: phonemes[i]! }));
}

/** Every cell of a track: mark `i` runs to mark `i + 1`, carrying label `i`. */
export function cellsOf(track: TimingTrack): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < track.marks.length - 1; i++) {
    cells.push({ startMs: track.marks[i]!, endMs: track.marks[i + 1]!, label: track.labels?.[i] ?? "" });
  }
  return cells;
}

/** Cells back into a track, with a closing mark so the last cell has an end. */
export function trackFromCells(name: string, cells: Cell[]): TimingTrack {
  const ordered = [...cells].sort((a, b) => a.startMs - b.startMs);
  const marks: number[] = [];
  const labels: string[] = [];
  for (const cell of ordered) {
    marks.push(cell.startMs);
    labels.push(cell.label);
  }
  const last = ordered[ordered.length - 1];
  if (last) {
    marks.push(last.endMs);
    labels.push("");
  }
  return { name, marks, labels };
}

/** The two tracks a lyric breakdown produces, named for the track they came from. */
export function wordsTrackName(phraseTrackName: string): string {
  return `${phraseTrackName} — Words`;
}
export function phonemesTrackName(phraseTrackName: string): string {
  return `${phraseTrackName} — Phonemes`;
}

/**
 * Every phrase in a track broken into words.
 *
 * Cells with no text are skipped rather than turned into an empty word: a lyric track usually has
 * marks in it before anybody types anything, and a silent gap between two lines is a real part of
 * the timing rather than a word nobody named.
 */
export function breakdownPhrases(track: TimingTrack): TimingTrack {
  const words = cellsOf(track).flatMap((cell) => (cell.label.trim() ? breakdownPhrase(cell.label, cell.startMs, cell.endMs) : []));
  return trackFromCells(wordsTrackName(track.name), words);
}

/** Every word in a track broken into phonemes. */
export function breakdownWords(wordsTrack: TimingTrack, phraseTrackName: string): TimingTrack {
  const phonemes = cellsOf(wordsTrack).flatMap((cell) => (cell.label.trim() ? breakdownWord(cell.label, cell.startMs, cell.endMs) : []));
  return trackFromCells(phonemesTrackName(phraseTrackName), phonemes);
}

/** Whether a phoneme is one a Faces effect can actually draw a mouth for. */
export function isStandardPhoneme(phoneme: string): boolean {
  return STANDARD_PHONEMES.includes(phoneme);
}

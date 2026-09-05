// Automatic lyric timing: what was heard in the song, lined up with what was pasted.
//
// The server listens to the audio and returns every word it heard with a start and end. That
// transcript is never quite the lyrics - a sung word gets misheard, a backing vocal adds one, a
// mumbled line loses two - so the pasted lyrics are the truth and the transcript is the clock:
// each lyric word that was heard takes the heard time, and the words in between are spread
// across the gap their neighbours leave. Lines become phrases, words stay words, and each word's
// mouth shapes come from the CMU Pronouncing Dictionary when it knows the word, and from its
// letters (lyricBreakdown.ts) when it does not. The same three tracks a Papagayo import makes.

import type { TimingTrack } from "./api";
import { cellsForPhonemes, phonemesForWord, phonemesTrackName, trackFromCells, wordsTrackName, type Cell } from "./lyricBreakdown";

export interface HeardWord {
  text: string;
  /** Seconds, as speech-to-text services report them. */
  start: number;
  end: number;
}

export interface AlignedWord extends Cell {
  /** The word as normalised for matching and dictionary lookup. */
  key: string;
  line: number;
  /** Whether the time came from the transcript (true) or was spread across a gap (false). */
  heard: boolean;
}

export interface Alignment {
  phrases: Cell[];
  words: AlignedWord[];
  /** How many of the lyric words were actually heard; the rest were interpolated. */
  heard: number;
}

/** The same normalisation as the server's dictionary lookup: lower case, letters and apostrophes. */
export function normaliseWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

/** Two words count as the same when they are, or when one letter's difference away for words long enough to tell. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // One edit apart: a substitution, or an insertion/deletion.
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const MIN_WORD_MS = 40;
/** How long an unheard word gets when there is no neighbour on one side to measure the gap from. */
const GUESSED_WORD_MS = 350;

export function alignLyrics(lyrics: string, heard: HeardWord[], durationMs?: number): Alignment {
  const lines = lyrics.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const words: AlignedWord[] = [];
  lines.forEach((line, lineIndex) => {
    for (const text of line.split(/\s+/)) {
      if (text) words.push({ label: text, key: normaliseWord(text), line: lineIndex, startMs: 0, endMs: 0, heard: false });
    }
  });
  const clock = heard.map((h) => ({ ...h, key: normaliseWord(h.text) })).filter((h) => h.key.length > 0 && h.end >= h.start);

  // Longest common subsequence of the two word lists, so a misheard or extra word costs only
  // itself and everything around it still lines up.
  const n = words.length;
  const m = clock.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = sameWord(words[i]!.key, clock[j]!.key) ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  let heardCount = 0;
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (sameWord(words[i]!.key, clock[j]!.key)) {
      const w = words[i]!;
      w.startMs = Math.round(clock[j]!.start * 1000);
      w.endMs = Math.max(Math.round(clock[j]!.end * 1000), w.startMs + MIN_WORD_MS);
      w.heard = true;
      heardCount++;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }

  // The words nobody heard are spread across the gap between the heard ones around them,
  // weighted by length, the way a typed phrase is broken into words.
  let i = 0;
  while (i < n) {
    if (words[i]!.heard) {
      i++;
      continue;
    }
    let end = i;
    while (end < n && !words[end]!.heard) end++;
    const run = words.slice(i, end);
    const before = i > 0 ? words[i - 1]!.endMs : null;
    const after = end < n ? words[end]!.startMs : null;
    let from: number;
    let to: number;
    if (before !== null && after !== null) {
      from = before;
      to = Math.max(after, before + run.length * MIN_WORD_MS);
    } else if (before !== null) {
      from = before;
      to = Math.min(before + run.length * GUESSED_WORD_MS, durationMs ?? Infinity);
    } else if (after !== null) {
      from = Math.max(0, after - run.length * GUESSED_WORD_MS);
      to = after;
    } else {
      from = 0;
      to = durationMs ?? run.length * GUESSED_WORD_MS;
    }
    const spread = cellsForPhonemes(
      run.map((w) => w.label),
      from,
      Math.max(to, from + run.length * MIN_WORD_MS),
    );
    run.forEach((w, k) => {
      w.startMs = spread[k]!.startMs;
      w.endMs = spread[k]!.endMs;
    });
    i = end;
  }

  // Time only runs forwards: a heard word that came back earlier than its predecessor (a
  // repeated chorus matched to the wrong verse) is pushed after it rather than overlapping.
  let cursor = 0;
  for (const w of words) {
    w.startMs = Math.max(w.startMs, cursor);
    w.endMs = Math.max(w.endMs, w.startMs + MIN_WORD_MS);
    cursor = w.endMs;
  }

  const phrases: Cell[] = lines.map((label, lineIndex) => {
    const own = words.filter((w) => w.line === lineIndex);
    return { label, startMs: own[0]?.startMs ?? 0, endMs: own[own.length - 1]?.endMs ?? 0 };
  });
  return { phrases, words, heard: heardCount };
}

/**
 * ARPAbet to Preston Blair mouth shapes - the mapping Papagayo ships and xLights' Faces effect
 * expects. Stress digits are dropped; a run of the same shape is one shape.
 */
const ARPABET_SHAPES: Record<string, string> = {
  AA: "AI", AE: "AI", AH: "AI", AO: "O", AW: "O", AY: "AI", EH: "E", ER: "E", EY: "AI", IH: "AI", IY: "E", OW: "O", OY: "WQ", UH: "U", UW: "U",
  B: "MBP", M: "MBP", P: "MBP", F: "FV", V: "FV", L: "L", W: "WQ",
};

export function shapesForArpabet(phones: string[]): string[] {
  const out: string[] = [];
  for (const phone of phones) {
    const shape = ARPABET_SHAPES[phone.replace(/\d/g, "").toUpperCase()] ?? "etc";
    if (out[out.length - 1] !== shape) out.push(shape);
  }
  return out.length ? out : ["rest"];
}

/** The three tracks: phrases named for the track, then its words and phonemes. */
export function lyricTimingTracks(name: string, alignment: Alignment, pronunciations: Record<string, string[]>): TimingTrack[] {
  const phonemes = alignment.words.flatMap((w) => {
    const said = pronunciations[w.key];
    return cellsForPhonemes(said ? shapesForArpabet(said) : phonemesForWord(w.label), w.startMs, w.endMs);
  });
  return [
    trackFromCells(name, alignment.phrases),
    trackFromCells(wordsTrackName(name), alignment.words.map(({ startMs, endMs, label }) => ({ startMs, endMs, label }))),
    trackFromCells(phonemesTrackName(name), phonemes),
  ];
}

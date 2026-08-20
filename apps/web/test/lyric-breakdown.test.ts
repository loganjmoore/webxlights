import { describe, expect, it } from "vitest";
import {
  breakdownPhrase,
  breakdownPhrases,
  breakdownWord,
  breakdownWords,
  cellsOf,
  isStandardPhoneme,
  phonemesForWord,
} from "../src/lib/lyricBreakdown";

const phraseTrack = {
  name: "Lyrics",
  marks: [0, 2000, 4000],
  labels: ["We wish you", "a merry Christmas"],
};

describe("breaking a phrase into words", () => {
  it("lays the words across the phrase's own span", () => {
    const words = breakdownPhrase("We wish you", 0, 2000);
    expect(words.map((w) => w.label)).toEqual(["We", "wish", "you"]);
    expect(words[0]!.startMs).toBe(0);
    expect(words[words.length - 1]!.endMs).toBe(2000);
  });

  it("leaves no gap between one word and the next", () => {
    const words = breakdownPhrase("a merry Christmas", 1000, 4000);
    for (let i = 1; i < words.length; i++) expect(words[i]!.startMs).toBe(words[i - 1]!.endMs);
  });

  it("gives a longer word longer, rather than splitting the span evenly", () => {
    // Even division makes "I" and "everything" the same length, which reads as a stutter and
    // then a rush.
    const [short, long] = breakdownPhrase("I everything", 0, 1100);
    expect(long!.endMs - long!.startMs).toBeGreaterThan(short!.endMs - short!.startMs);
  });

  it("skips a phrase nobody typed into", () => {
    // A lyric track has marks before it has words, and a silent gap between two lines is part of
    // the timing rather than a word with no name.
    const words = breakdownPhrases({ name: "L", marks: [0, 1000, 2000], labels: ["", "hello"] });
    expect(cellsOf(words).filter((c) => c.label)).toHaveLength(1);
  });
});

describe("breaking a word into phonemes", () => {
  it("uses mouth shapes a face can actually draw", () => {
    for (const p of phonemesForWord("merry")) expect(isStandardPhoneme(p), p).toBe(true);
  });

  it("maps letters onto their Preston Blair shapes", () => {
    expect(phonemesForWord("map")).toEqual(["MBP", "AI", "MBP"]);
    expect(phonemesForWord("love")).toEqual(["L", "O", "FV", "E"]);
  });

  it("collapses a run of the same shape", () => {
    // A mouth holding one shape for two frames is one visible shape; a phoneme per letter makes
    // a face chatter at spelling rather than at speech.
    expect(phonemesForWord("keep")).toEqual(["etc", "E", "MBP"]);
  });

  it("still gives a shape to a word with no letters in it", () => {
    expect(phonemesForWord("...")).toEqual(["rest"]);
  });

  it("lays the phonemes across the word's own span", () => {
    const cells = breakdownWord("map", 500, 800);
    expect(cells.map((c) => c.label)).toEqual(["MBP", "AI", "MBP"]);
    expect(cells[0]!.startMs).toBe(500);
    expect(cells[cells.length - 1]!.endMs).toBe(800);
  });
});

describe("the three levels together", () => {
  it("names each level after the track it came from", () => {
    const words = breakdownPhrases(phraseTrack);
    const phonemes = breakdownWords(words, phraseTrack.name);
    expect(words.name).toBe("Lyrics — Words");
    expect(phonemes.name).toBe("Lyrics — Phonemes");
  });

  it("keeps every level inside the span of the one above it", () => {
    const words = breakdownPhrases(phraseTrack);
    const phonemes = breakdownWords(words, phraseTrack.name);
    expect(Math.min(...words.marks)).toBeGreaterThanOrEqual(Math.min(...phraseTrack.marks));
    expect(Math.max(...words.marks)).toBeLessThanOrEqual(Math.max(...phraseTrack.marks));
    expect(Math.max(...phonemes.marks)).toBeLessThanOrEqual(Math.max(...words.marks));
  });

  it("closes the last cell so it has an end to run to", () => {
    const words = breakdownPhrases(phraseTrack);
    expect(words.marks.length).toBe((words.labels?.length ?? 0));
    expect(cellsOf(words).every((c) => c.endMs > c.startMs)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { ParsedPapagayo } from "@webxlights/formats";
import { describePapagayoImport, tracksForVoice, tracksFromPapagayo } from "../src/lib/papagayoTiming";

// 25fps, so a frame is exactly 40ms and every expectation below is a round number.
const FILE: ParsedPapagayo = {
  fps: 25,
  frameCount: 250,
  voices: [
    {
      name: "Lead",
      phrases: [
        {
          text: "hello world",
          startFrame: 0,
          endFrame: 50,
          words: [
            { text: "hello", startFrame: 0, endFrame: 25, phonemes: [{ frame: 0, phoneme: "E" }, { frame: 10, phoneme: "L" }] },
            { text: "world", startFrame: 25, endFrame: 50, phonemes: [{ frame: 25, phoneme: "O" }] },
          ],
        },
      ],
    },
  ],
};

describe("a Papagayo voice as timing tracks", () => {
  it("makes the manual's three tracks for a voice", () => {
    // "a timing track with the three components is created for each Voice" - flat tracks here, so
    // that is three tracks rather than one with three rows.
    const tracks = tracksForVoice(FILE.voices[0]!, FILE.fps, 0);
    expect(tracks.map((t) => t.name)).toEqual(["Lead — Phrases", "Lead — Words", "Lead — Phonemes"]);
  });

  it("converts frames to milliseconds at the file's own frame rate", () => {
    const [phrases] = tracksForVoice(FILE.voices[0]!, FILE.fps, 0);
    expect(phrases!.marks).toEqual([0, 2000]); // frame 50 at 25fps
    expect(phrases!.labels).toEqual(["hello world", ""]);
  });

  it("runs each phoneme until the next one, and the last until its word ends", () => {
    // A phoneme has a start frame and no end. Without this rule the last phoneme of every word
    // would be an instant rather than a mouth position that is actually held.
    const phonemes = tracksForVoice(FILE.voices[0]!, FILE.fps, 0)[2]!;
    expect(phonemes.marks).toEqual([0, 400, 1000, 2000]);
    expect(phonemes.labels).toEqual(["E", "L", "O", ""]);
  });

  it("shifts everything by the offset the manual's dialog asks for", () => {
    // "Specify the number of frames to offset the data by... the second segment had to be offset
    // by the number of frames of the first segment."
    const [phrases] = tracksForVoice(FILE.voices[0]!, FILE.fps, 0, { offsetFrames: 25 });
    expect(phrases!.marks).toEqual([1000, 3000]);
  });

  it("closes a cell that has a gap after it, and doesn't when the next one follows straight on", () => {
    const gappy: ParsedPapagayo = {
      ...FILE,
      voices: [
        {
          name: "V",
          phrases: [
            { text: "one", startFrame: 0, endFrame: 25, words: [] },
            { text: "two", startFrame: 50, endFrame: 75, words: [] },
          ],
        },
      ],
    };
    const [phrases] = tracksForVoice(gappy.voices[0]!, 25, 0);
    // A closing mark at 1000 so "one" doesn't stretch across the silence before "two".
    expect(phrases!.marks).toEqual([0, 1000, 2000, 3000]);
    expect(phrases!.labels).toEqual(["one", "", "two", ""]);
  });

  it("names an unnamed voice by its position", () => {
    const unnamed: ParsedPapagayo = { ...FILE, voices: [{ ...FILE.voices[0]!, name: "" }] };
    expect(tracksFromPapagayo(unnamed)[0]!.name).toBe("Voice 1 — Phrases");
  });

  it("leaves out a component the file has nothing for", () => {
    // A phrase-only file shouldn't produce two empty tracks that look like a failed import.
    const phraseOnly: ParsedPapagayo = {
      ...FILE,
      voices: [{ name: "V", phrases: [{ text: "one", startFrame: 0, endFrame: 25, words: [] }] }],
    };
    expect(tracksFromPapagayo(phraseOnly).map((t) => t.name)).toEqual(["V — Phrases"]);
  });

  it("says what it produced", () => {
    const tracks = tracksFromPapagayo(FILE);
    expect(describePapagayoImport(FILE, tracks)).toBe("1 voice, 3 phonemes → 3 timing tracks");
    expect(describePapagayoImport({ ...FILE, voices: [] }, [])).toBe("That file has no phrases in it.");
  });
});

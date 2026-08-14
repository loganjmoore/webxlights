import { describe, expect, it } from "vitest";
import { parsePapagayo } from "../src/papagayo";

// A two-word, one-phrase file for one voice. Written out rather than kept as a fixture so the
// structure the parser depends on is visible next to the assertions about it.
const ONE_VOICE = [
  "lipsync data:",
  "song.wav",
  "24", // fps
  "120", // total frames
  "1", // voices
  "Voice 1",
  "hello world",
  "1", // phrases
  "hello world",
  "0", // phrase start
  "48", // phrase end
  "2", // words
  "hello 0 24 2",
  "0 E",
  "12 L",
  "world 24 48 2",
  "24 O",
  "36 L",
].join("\n");

describe("Papagayo files", () => {
  it("reads the header the manual describes", () => {
    // "The 4th line contains the total number of frames and the 5th line has the number of Voices
    // in the file, followed by the details for each voice."
    const parsed = parsePapagayo(ONE_VOICE);
    expect(parsed.fps).toBe(24);
    expect(parsed.frameCount).toBe(120);
    expect(parsed.voices).toHaveLength(1);
  });

  it("reads the phrases, words and phonemes", () => {
    const voice = parsePapagayo(ONE_VOICE).voices[0]!;
    expect(voice.name).toBe("Voice 1");
    expect(voice.phrases[0]!.text).toBe("hello world");
    expect(voice.phrases[0]!.words.map((w) => w.text)).toEqual(["hello", "world"]);
    expect(voice.phrases[0]!.words[0]!.phonemes).toEqual([
      { frame: 0, phoneme: "E" },
      { frame: 12, phoneme: "L" },
    ]);
  });

  it("keeps a word whose text contains spaces", () => {
    // The frames are taken from the end of the line rather than the text from the front, so a
    // hyphenated or spaced word doesn't swallow its own start frame.
    const file = ONE_VOICE.replace("hello 0 24 2", "he llo 0 24 2");
    const word = parsePapagayo(file).voices[0]!.phrases[0]!.words[0]!;
    expect(word.text).toBe("he llo");
    expect(word.startFrame).toBe(0);
  });

  it("reads several voices", () => {
    const two = [
      "lipsync data:",
      "song.wav",
      "24",
      "120",
      "2",
      "Lead",
      "one",
      "1",
      "one",
      "0",
      "24",
      "1",
      "one 0 24 1",
      "0 AI",
      "Backing",
      "two",
      "1",
      "two",
      "24",
      "48",
      "1",
      "two 24 48 1",
      "24 O",
    ].join("\n");
    const parsed = parsePapagayo(two);
    expect(parsed.voices.map((v) => v.name)).toEqual(["Lead", "Backing"]);
    expect(parsed.voices[1]!.phrases[0]!.words[0]!.phonemes[0]!.phoneme).toBe("O");
  });

  it("throws rather than returning half a file", () => {
    // A truncated lipsync file read leniently imports as a track whose words drift out of sync
    // partway through - far harder to notice than an import that refused.
    const truncated = ONE_VOICE.split("\n").slice(0, 12).join("\n");
    expect(() => parsePapagayo(truncated)).toThrow(/Unexpected end/);
  });

  it("rejects a file with no frame rate, since its frames aren't a time", () => {
    const noFps = ONE_VOICE.replace("\n24\n120\n", "\n0\n120\n");
    expect(() => parsePapagayo(noFps)).toThrow(/frame rate/);
  });

  it("rejects something that isn't a Papagayo file at all", () => {
    expect(() => parsePapagayo("not\na\npgo\nfile\nat all")).toThrow();
  });
});

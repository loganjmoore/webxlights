import { describe, expect, it } from "vitest";
import { alignLyrics, heardSinging, linesFromText, lyricTimingTracks, normaliseWord, shapesForArpabet, lyricsFromTranscript, lyricTracksFor } from "../src/lib/lyricAlign";
import { xtimingXml } from "../src/lib/xtimingExport";

const heard = (text: string, start: number, end: number) => ({ text, start, end });

describe("lining up pasted lyrics with what was heard", () => {
  it("gives every heard word its time and the lines their span", () => {
    const a = alignLyrics("Jingle bells\nJingle all the way", [heard("Jingle", 1, 1.4), heard("bells,", 1.5, 2), heard("jingle", 3, 3.3), heard("all", 3.4, 3.6), heard("the", 3.6, 3.7), heard("way", 3.8, 4.5)]);
    expect(a.heard).toBe(6);
    expect(a.words.map((w) => [w.label, w.startMs, w.endMs])).toEqual([
      ["Jingle", 1000, 1400], ["bells", 1500, 2000], ["Jingle", 3000, 3300], ["all", 3400, 3600], ["the", 3600, 3700], ["way", 3800, 4500],
    ]);
    expect(a.phrases).toEqual([
      { label: "Jingle bells", startMs: 1000, endMs: 2000 },
      { label: "Jingle all the way", startMs: 3000, endMs: 4500 },
    ]);
  });

  it("spreads the words nobody heard across the gap their neighbours leave", () => {
    // "in a" was lost; it lands between "fun" and "one-horse", longer word longer.
    const a = alignLyrics("Oh what fun it is to ride", [heard("Oh", 0, 0.2), heard("what", 0.2, 0.5), heard("fun", 0.5, 1), heard("ride", 2, 2.5)]);
    const [, , , it_, is, to, ride] = a.words;
    expect(it_!.heard).toBe(false);
    expect(it_!.startMs).toBe(1000);
    expect(to!.endMs).toBe(2000);
    expect(is!.startMs).toBe(it_!.endMs);
    expect(ride!.startMs).toBe(2000);
    expect(a.heard).toBe(4);
  });

  it("ignores extra words the service heard that are not in the lyrics", () => {
    const a = alignLyrics("silent night", [heard("uh", 0, 0.3), heard("silent", 1, 1.6), heard("yeah", 1.7, 1.9), heard("night", 2, 2.8)]);
    expect(a.words.map((w) => [w.startMs, w.endMs])).toEqual([[1000, 1600], [2000, 2800]]);
  });

  it("forgives one letter's difference on a longer word, never on a short one", () => {
    const a = alignLyrics("holly jolly cat", [heard("holy", 1, 1.5), heard("jolly", 2, 2.5), heard("cut", 3, 3.5)]);
    expect(a.words.map((w) => w.heard)).toEqual([true, true, false]);
  });

  it("never runs time backwards when a repeated line matched the wrong place", () => {
    const a = alignLyrics("la la\nla la", [heard("la", 0, 0.5), heard("la", 1, 1.5), heard("la", 0.2, 0.4), heard("la", 2, 2.5)]);
    for (let i = 1; i < a.words.length; i++) expect(a.words[i]!.startMs).toBeGreaterThanOrEqual(a.words[i - 1]!.endMs);
  });

  it("guesses a length for words before the first or after the last heard one", () => {
    const a = alignLyrics("one two three", [heard("two", 1, 1.5)], 10_000);
    expect(a.words[0]!.startMs).toBe(650);
    expect(a.words[0]!.endMs).toBe(1000);
    expect(a.words[2]!.startMs).toBe(1500);
    expect(a.words[2]!.endMs).toBe(1850);
  });

  it("copes with nothing heard at all", () => {
    const a = alignLyrics("a b", [], 2000);
    expect(a.heard).toBe(0);
    expect(a.words.map((w) => [w.startMs, w.endMs])).toEqual([[0, 1000], [1000, 2000]]);
  });
});

describe("mouth shapes", () => {
  it("normalises the way the dictionary is keyed", () => {
    expect(normaliseWord("Christmas,")).toBe("christmas");
    expect(normaliseWord("DON'T!")).toBe("don't");
  });

  it("maps ARPAbet to Preston Blair shapes and collapses runs", () => {
    expect(shapesForArpabet(["K", "R", "IH1", "S", "M", "AH0", "S"])).toEqual(["etc", "AI", "etc", "MBP", "AI", "etc"]);
    expect(shapesForArpabet(["W", "EY1"])).toEqual(["WQ", "AI"]);
    expect(shapesForArpabet([])).toEqual(["rest"]);
  });

  it("builds the three tracks, using the dictionary where it knows the word and letters elsewhere", () => {
    const a = alignLyrics("way zorp", [heard("way", 1, 1.5), heard("zorp", 2, 2.5)]);
    const [phrases, words, phonemes] = lyricTimingTracks("Lyrics", a, { way: ["W", "EY1"] });
    expect(phrases!.name).toBe("Lyrics");
    expect(words!.name).toBe("Lyrics — Words");
    expect(phonemes!.name).toBe("Lyrics — Phonemes");
    expect(phrases!.labels).toEqual(["way zorp", ""]);
    expect(phonemes!.labels!.slice(0, 2)).toEqual(["WQ", "AI"]);
    // zorp is not in the dictionary: letters. z→etc, o→O, r→etc, p→MBP
    expect(phonemes!.labels!.slice(2, 6)).toEqual(["etc", "O", "etc", "MBP"]);
  });
});

describe("xtiming export", () => {
  it("writes xLights' timing file with one layer per level, escaped", () => {
    const xml = xtimingXml("Lyrics", [[{ label: 'say "hi" & <go>', startMs: 0, endMs: 1000 }], [{ label: "hi", startMs: 0, endMs: 1000 }]]);
    expect(xml).toContain('<timing name="Lyrics" SourceVersion="2024.20">');
    expect(xml).toContain('<Effect label="say &quot;hi&quot; &amp; &lt;go&gt;" starttime="0" endtime="1000" />');
    expect(xml.match(/<EffectLayer>/g)).toHaveLength(2);
  });
});

describe("lyrics heard rather than pasted", () => {
  const heard = [
    { text: "Dashing", start: 1, end: 1.4 }, { text: "through", start: 1.5, end: 1.8 }, { text: "the", start: 1.8, end: 1.9 }, { text: "snow,", start: 2, end: 2.6 },
    { text: "In", start: 4, end: 4.2 }, { text: "a", start: 4.2, end: 4.3 }, { text: "sleigh", start: 4.4, end: 5 },
  ];

  it("makes a line of each phrase the service heard, else of each stretch of singing", () => {
    expect(lyricsFromTranscript(heard, [{ text: " Dashing through the snow, ", start: 1, end: 2.6 }, { text: "In a sleigh", start: 4, end: 5 }])).toBe("Dashing through the snow,\nIn a sleigh");
    // No phrases: the 1.4 s pause starts a new line.
    expect(lyricsFromTranscript(heard)).toBe("Dashing through the snow,\nIn a sleigh");
  });

  it("times every heard word where it was heard, with nothing pasted", () => {
    const record = { id: 1, status: "done" as const, lyrics: null, error: null, created_at: null, result: { words: heard, language: "english", model: "whisper-1", pronunciations: { sleigh: ["S", "L", "EY1"] } } };
    const made = lyricTracksFor("Lyrics", record, 10_000)!;
    expect(made.alignment.heard).toBe(heard.length);
    expect(made.alignment.phrases.map((p) => [p.label, p.startMs, p.endMs])).toEqual([["Dashing through the snow,", 1000, 2600], ["In a sleigh", 4000, 5000]]);
    expect(made.tracks.map((t) => t.name)).toEqual(["Lyrics", "Lyrics — Words", "Lyrics — Phonemes"]);
  });
});

describe("lyrics a text model wrote down", () => {
  it("makes a line of each sentence, none longer than ten words", () => {
    expect(linesFromText("Over the hills the little sleigh goes by. The lanterns swing and the bells are ringing all along the lane tonight, oh")).toBe(
      "Over the hills the little sleigh goes by.\nThe lanterns swing and the bells are ringing all along\nthe lane tonight, oh",
    );
  });

  it("are the lyrics, timed by whisper's clock", () => {
    const words = [
      { text: "Over", start: 1, end: 1.3 }, { text: "the", start: 1.3, end: 1.4 }, { text: "hill", start: 1.4, end: 1.9 },
      { text: "sleigh", start: 2.4, end: 2.9 }, { text: "goes", start: 3, end: 3.3 }, { text: "by", start: 3.3, end: 3.8 },
    ];
    const record = { id: 1, status: "done" as const, lyrics: null, error: null, created_at: null, result: { words, text: "Over the hills the sleigh goes by.", language: "english", model: "gpt-transcribe + whisper-1", pronunciations: {} } };
    const made = lyricTracksFor("Lyrics", record, 10_000)!;
    // The text's words, not whisper's ("hills", not "hill"), each heard one on whisper's time.
    expect(made.alignment.words.map((w) => w.label)).toEqual(["Over", "the", "hills", "the", "sleigh", "goes", "by."]);
    expect(made.alignment.words.find((w) => w.label === "sleigh")!.startMs).toBe(2400);
    expect(heardSinging(words, 60_000, "Over the hills the sleigh goes by. Over the hills the sleigh goes by.")).toBe(true);
    expect(heardSinging(words, 120_000, "Music.")).toBe(false);
  });
});

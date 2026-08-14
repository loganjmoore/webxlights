// Papagayo `.pgo` lipsync files.
//
// Papagayo is the tool people used to break lyrics into phonemes before xLights could do it
// itself, and its files are still how a lot of singing faces were built. The manual's "Importing
// Papagayo files" section describes what comes out: "The Phrases, words and phonemes are imported
// and a timing track with the three components is created for each Voice contained in the PGO
// file", with an offset in frames for files that were split into segments.
//
// The format is plain text and strictly count-driven: every list says how long it is before it
// starts. That is what makes this parser safe to write without a specimen file to hand - a wrong
// guess about the layout doesn't produce plausible garbage, it fails to line up and throws.
//
// The manual pins the header down: "The 4th line contains the total number of frames and the 5th
// line has the number of Voices in the file". Counting from one, that puts the magic line, the
// audio path and the frame rate on lines 1-3.

export interface PapagayoPhoneme {
  frame: number;
  phoneme: string;
}

export interface PapagayoWord {
  text: string;
  startFrame: number;
  endFrame: number;
  phonemes: PapagayoPhoneme[];
}

export interface PapagayoPhrase {
  text: string;
  startFrame: number;
  endFrame: number;
  words: PapagayoWord[];
}

export interface PapagayoVoice {
  name: string;
  phrases: PapagayoPhrase[];
}

export interface ParsedPapagayo {
  fps: number;
  frameCount: number;
  voices: PapagayoVoice[];
}

class Lines {
  private at = 0;
  private readonly lines: string[];

  constructor(text: string) {
    // Trailing blank lines are common and meaningless; interior ones are not stripped, because a
    // phrase's text can legitimately be empty and dropping it would shift every count after it.
    this.lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (this.lines.length > 0 && this.lines[this.lines.length - 1]!.trim() === "") this.lines.pop();
  }

  next(): string {
    if (this.at >= this.lines.length) throw new Error("Unexpected end of Papagayo file");
    return this.lines[this.at++]!;
  }

  nextInt(what: string): number {
    const raw = this.next().trim();
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value)) throw new Error(`Expected ${what} in the Papagayo file, found "${raw}"`);
    return value;
  }

  get done(): boolean {
    return this.at >= this.lines.length;
  }
}

/**
 * Reads a `.pgo` file.
 *
 * Throws on anything that doesn't line up, rather than returning what it managed: a half-read
 * lipsync file would import as a timing track whose words drift out of sync partway through,
 * which is much harder to notice than an import that refused.
 */
export function parsePapagayo(text: string): ParsedPapagayo {
  const lines = new Lines(text);

  lines.next(); // "lipsync data:" or whatever this version calls itself
  lines.next(); // the audio file it was made against, which means nothing here
  const fps = lines.nextInt("the frame rate");
  const frameCount = lines.nextInt("the frame count");
  const voiceCount = lines.nextInt("the number of voices");
  if (fps <= 0) throw new Error("This Papagayo file has no frame rate, so its frames aren't a time");
  if (voiceCount < 0 || voiceCount > 100) throw new Error(`This Papagayo file claims ${voiceCount} voices`);

  const voices: PapagayoVoice[] = [];
  for (let v = 0; v < voiceCount; v++) {
    const name = lines.next().trim();
    lines.next(); // the whole voice's text, repeated below phrase by phrase
    const phraseCount = lines.nextInt("a phrase count");

    const phrases: PapagayoPhrase[] = [];
    for (let p = 0; p < phraseCount; p++) {
      const text = lines.next().trim();
      const startFrame = lines.nextInt("a phrase start frame");
      const endFrame = lines.nextInt("a phrase end frame");
      const wordCount = lines.nextInt("a word count");

      const words: PapagayoWord[] = [];
      for (let w = 0; w < wordCount; w++) {
        // "<text> <start> <end> <phoneme count>" - the text can contain spaces, so the three
        // numbers are taken from the end rather than the text from the front.
        const parts = lines.next().trim().split(/\s+/);
        if (parts.length < 4) throw new Error(`A word line in the Papagayo file is missing its frames: "${parts.join(" ")}"`);
        const phonemeCount = parseInt(parts.pop()!, 10);
        const wordEnd = parseInt(parts.pop()!, 10);
        const wordStart = parseInt(parts.pop()!, 10);

        const phonemes: PapagayoPhoneme[] = [];
        for (let i = 0; i < phonemeCount; i++) {
          const [frame = "", phoneme = ""] = lines.next().trim().split(/\s+/);
          phonemes.push({ frame: parseInt(frame, 10) || 0, phoneme });
        }
        words.push({ text: parts.join(" "), startFrame: wordStart, endFrame: wordEnd, phonemes });
      }
      phrases.push({ text, startFrame, endFrame, words });
    }
    voices.push({ name: name || `Voice ${v + 1}`, phrases });
  }

  return { fps, frameCount, voices };
}

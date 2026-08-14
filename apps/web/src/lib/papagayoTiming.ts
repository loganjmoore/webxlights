import type { ParsedPapagayo, PapagayoVoice } from "@webxlights/formats";
import type { TimingTrack } from "./api";

// A Papagayo file's voices as timing tracks.
//
// The manual: "The Phrases, words and phonemes are imported and a timing track with the three
// components is created for each Voice contained in the PGO file."
//
// xLights nests those three components inside one track; this app's timing tracks are flat, so a
// voice becomes three tracks that say which component they are. That is a real difference and
// worth naming rather than glossing: the three can be moved apart here in a way they can't be
// there. What matters for rendering is unchanged — a Faces effect reads the phonemes track, and
// the phrases and words tracks are there to read and edit alongside it.
//
// The offset is the manual's own: "Specify the number of frames to offset the data by. Due to a
// performance limitation in the Papagayo software, a sequence often had to be broken up into
// segments. In which case the second segment had to be offset by the number of frames of the
// first segment."

export interface PapagayoImportOptions {
  /** Frames, as the manual's dialog asks for them. */
  offsetFrames?: number;
}

/** A cell runs from its own mark to the next; the last entry needs a mark to close it. */
function trackFrom(name: string, cells: { startMs: number; endMs: number; label: string }[]): TimingTrack {
  const marks: number[] = [];
  const labels: string[] = [];
  const ordered = [...cells].sort((a, b) => a.startMs - b.startMs);

  ordered.forEach((cell, i) => {
    marks.push(cell.startMs);
    labels.push(cell.label);
    const next = ordered[i + 1];
    // A gap before the next cell needs a closing mark, or the label would stretch across silence.
    if (!next || next.startMs > cell.endMs) {
      marks.push(cell.endMs);
      labels.push("");
    }
  });

  return { name, marks, labels };
}

/**
 * The three tracks one voice produces.
 *
 * A phoneme has a start frame but no end: it runs until the next phoneme, and the last one until
 * the end of its word. That is the same rule the format itself implies, and it is why the phoneme
 * track is built per word rather than from a flat list.
 */
export function tracksForVoice(
  voice: PapagayoVoice,
  fps: number,
  index: number,
  options: PapagayoImportOptions = {},
): TimingTrack[] {
  const offset = options.offsetFrames ?? 0;
  const toMs = (frame: number): number => Math.max(0, Math.round(((frame + offset) * 1000) / fps));
  const name = voice.name || `Voice ${index + 1}`;

  const phrases = voice.phrases.map((p) => ({ startMs: toMs(p.startFrame), endMs: toMs(p.endFrame), label: p.text }));
  const words = voice.phrases.flatMap((p) =>
    p.words.map((w) => ({ startMs: toMs(w.startFrame), endMs: toMs(w.endFrame), label: w.text })),
  );
  const phonemes = voice.phrases.flatMap((p) =>
    p.words.flatMap((w) =>
      w.phonemes.map((ph, i) => ({
        startMs: toMs(ph.frame),
        endMs: toMs(w.phonemes[i + 1]?.frame ?? w.endFrame),
        label: ph.phoneme,
      })),
    ),
  );

  return [
    trackFrom(`${name} — Phrases`, phrases),
    trackFrom(`${name} — Words`, words),
    trackFrom(`${name} — Phonemes`, phonemes),
  ].filter((track) => track.marks.length > 0);
}

export function tracksFromPapagayo(parsed: ParsedPapagayo, options: PapagayoImportOptions = {}): TimingTrack[] {
  return parsed.voices.flatMap((voice, i) => tracksForVoice(voice, parsed.fps, i, options));
}

/** A one-line account of what an import produced. */
export function describePapagayoImport(parsed: ParsedPapagayo, tracks: TimingTrack[]): string {
  if (tracks.length === 0) return "That file has no phrases in it.";
  const phonemes = parsed.voices.reduce(
    (n, v) => n + v.phrases.reduce((m, p) => m + p.words.reduce((k, w) => k + w.phonemes.length, 0), 0),
    0,
  );
  const voices = parsed.voices.length;
  return `${voices} ${voices === 1 ? "voice" : "voices"}, ${phonemes} phonemes → ${tracks.length} timing tracks`;
}

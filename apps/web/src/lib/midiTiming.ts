import { midiKeyName } from "@webxlights/engine";
import type { ParsedMidi } from "@webxlights/formats";
import type { TimingTrack } from "./api";

// Turning a MIDI file's notes into a timing track.
//
// The Piano effect lists a MIDI file as one of its notes sources. It is driven here by a *timing
// track* — the manual's own "preferred option" — so a MIDI file becomes useful by becoming one of
// those, rather than by teaching the effect a second way to read notes. That also means the notes
// are visible and editable once they're in: a wrong chord is a label you can retype.
//
// Two of the manual's Piano settings belong to this step rather than to the effect, because they
// describe the *file* and not the rendering: "Midi Start Time Adjust... to adjust the
// synchronisation of the midi file to the song being sequenced in case they are slightly off",
// and "Midi Speed Adjust... to adjust the tempo (increase or slow down)".

export const ALL_TRACKS = "All";

export interface MidiTimingOptions {
  /** A track name, or ALL_TRACKS to merge them - the manual's own Track option. */
  track?: string;
  /** "Midi Start Time Adjust": shifts every note, for a file that runs early or late. */
  startAdjustMs?: number;
  /** "Midi Speed Adjust": 100 is as written, 200 twice as fast. */
  speedPct?: number;
  /** Note names ("C4 E4 G4") or raw MIDI numbers - the Piano effect reads either. */
  labelAs?: "notes" | "midi";
  name?: string;
}

/** The Track options for a file: each named track, plus "All" - "in which case the tracks are merged". */
export function midiTrackChoices(parsed: ParsedMidi): string[] {
  const named = parsed.tracks
    .map((t, i) => (t.notes.length === 0 ? null : t.name || `Track ${i + 1}`))
    .filter((name): name is string => name !== null);
  // Tracks with no notes are left out: choosing one would produce an empty timing track and look
  // like the import failed.
  return named.length > 1 ? [ALL_TRACKS, ...named] : named;
}

function selectedNotes(parsed: ParsedMidi, track: string): ParsedMidi["tracks"][number]["notes"] {
  const chosen =
    track === ALL_TRACKS || !track
      ? parsed.tracks
      : parsed.tracks.filter((t, i) => (t.name || `Track ${i + 1}`) === track);
  return chosen.flatMap((t) => t.notes);
}

/**
 * Builds a timing track whose cells say which keys are down.
 *
 * Boundaries come from every note start *and* every note end, not just the starts: a note held
 * across the next one has to still be pressed when that one arrives, and a cell that only knew
 * about onsets would release it early. Between the boundaries, the label lists everything
 * sounding — which is exactly what the Piano effect reads back out.
 *
 * A cell where nothing sounds gets no label, so the keyboard is empty there rather than holding
 * the last chord.
 */
export function timingTrackFromMidi(parsed: ParsedMidi, options: MidiTimingOptions = {}): TimingTrack {
  const speed = Math.max(1, options.speedPct ?? 100);
  const shift = options.startAdjustMs ?? 0;
  const at = (ms: number): number => Math.round((ms * 100) / speed + shift);

  // A negative adjustment can push notes off the front of the sequence. One that *straddles* zero
  // is clamped to it - it is still playing when the sequence starts - while one that ends before
  // zero is dropped, because it finished before there was anything to play it on. Clamping both
  // ends of an early note to zero would leave a zero-length note that quietly disappeared later.
  const notes = selectedNotes(parsed, options.track ?? ALL_TRACKS)
    .map((n) => ({ midi: n.midi, startMs: at(n.startMs), endMs: at(n.endMs) }))
    .filter((n) => n.endMs > 0 && n.endMs > n.startMs)
    .map((n) => ({ ...n, startMs: Math.max(0, n.startMs) }));

  const boundaries = [...new Set(notes.flatMap((n) => [n.startMs, n.endMs]))].sort((a, b) => a - b);

  const marks: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const from = boundaries[i]!;
    const to = boundaries[i + 1];
    marks.push(from);
    if (to === undefined) {
      labels.push(""); // the closing mark: it opens no cell
      continue;
    }
    const sounding = notes
      .filter((n) => n.startMs <= from && n.endMs > from)
      .map((n) => n.midi)
      .sort((a, b) => a - b);
    labels.push(sounding.map((midi) => (options.labelAs === "midi" ? String(midi) : midiKeyName(midi))).join(" "));
  }

  return { name: options.name?.trim() || "MIDI Notes", marks, labels };
}

/** A one-line account of what an import produced, for the panel that ran it. */
export function describeMidiImport(track: TimingTrack, parsed: ParsedMidi): string {
  const cells = track.labels?.filter(Boolean).length ?? 0;
  const notes = parsed.tracks.reduce((n, t) => n + t.notes.length, 0);
  if (cells === 0) return "No notes in that track.";
  return `${notes} notes → ${cells} labelled cells, ending at ${(Math.max(...track.marks) / 1000).toFixed(1)}s`;
}

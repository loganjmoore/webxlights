import { describe, expect, it } from "vitest";
import { parsePianoKeys } from "@webxlights/engine";
import type { ParsedMidi } from "@webxlights/formats";
import { ALL_TRACKS, describeMidiImport, midiTrackChoices, timingTrackFromMidi } from "../src/lib/midiTiming";

function midi(tracks: { name?: string; notes: [number, number, number][] }[]): ParsedMidi {
  const built = tracks.map((t) => ({
    name: t.name ?? "",
    notes: t.notes.map(([m, s, e]) => ({ midi: m, startMs: s, endMs: e, velocity: 100 })),
  }));
  return { tracks: built, durationMs: Math.max(0, ...built.flatMap((t) => t.notes.map((n) => n.endMs))) };
}

describe("a MIDI file as a timing track", () => {
  it("labels each cell with the keys sounding in it", () => {
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 500], [64, 500, 1000]] }]));
    expect(track.marks).toEqual([0, 500, 1000]);
    expect(track.labels).toEqual(["C4", "E4", ""]);
  });

  it("keeps a held note pressed while later notes come and go", () => {
    // The reason boundaries come from note *ends* as well as starts: a bass note held under a
    // melody has to still be down when the melody moves, and a track built from onsets alone
    // would release it the moment anything else started.
    const track = timingTrackFromMidi(midi([{ notes: [[48, 0, 1000], [60, 250, 500]] }]));
    expect(track.marks).toEqual([0, 250, 500, 1000]);
    expect(track.labels).toEqual(["C3", "C3 C4", "C3", ""]);
  });

  it("writes labels the Piano effect reads back as the same keys", () => {
    // The whole point of the import: what this writes has to be what that parses.
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 500], [64, 0, 500], [67, 0, 500]] }]));
    expect(parsePianoKeys(track.labels![0]!)).toEqual([60, 64, 67]);
  });

  it("leaves a silent stretch unlabelled rather than holding the last chord", () => {
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 200], [62, 800, 1000]] }]));
    expect(track.marks).toEqual([0, 200, 800, 1000]);
    expect(track.labels).toEqual(["C4", "", "D4", ""]);
  });

  it("can label with MIDI numbers instead of note names", () => {
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 500]] }]), { labelAs: "midi" });
    expect(track.labels![0]).toBe("60");
  });

  it("shifts every note by the start adjustment", () => {
    // "to adjust the synchronisation of the midi file to the song being sequenced in case they
    // are slightly off from each other"
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 500]] }]), { startAdjustMs: 250 });
    expect(track.marks).toEqual([250, 750]);
  });

  it("clamps a note the adjustment pushes across the start, and drops one it pushes past it", () => {
    // A negative adjustment can move notes off the front of the sequence. A note still sounding
    // when the sequence starts belongs at zero; one that finished before then is gone. Clamping
    // both ends of an early note to zero instead would leave a zero-length note that vanished
    // later on, somewhere with less to say about why.
    const straddling = timingTrackFromMidi(midi([{ notes: [[60, 0, 500]] }]), { startAdjustMs: -250 });
    expect(straddling.marks).toEqual([0, 250]);
    expect(straddling.labels![0]).toBe("C4");

    const entirelyBefore = timingTrackFromMidi(midi([{ notes: [[60, 0, 500]] }]), { startAdjustMs: -2000 });
    expect(entirelyBefore.marks).toEqual([]);
  });

  it("scales the whole file by the speed adjustment", () => {
    // 200% is twice as fast, so everything happens in half the time.
    const track = timingTrackFromMidi(midi([{ notes: [[60, 0, 1000]] }]), { speedPct: 200 });
    expect(track.marks).toEqual([0, 500]);
  });

  it("merges every track when All is chosen, and picks one when it isn't", () => {
    const file = midi([
      { name: "Bass", notes: [[48, 0, 1000]] },
      { name: "Lead", notes: [[72, 0, 1000]] },
    ]);
    expect(timingTrackFromMidi(file, { track: ALL_TRACKS }).labels![0]).toBe("C3 C5");
    expect(timingTrackFromMidi(file, { track: "Lead" }).labels![0]).toBe("C5");
  });

  it("offers Track choices only for tracks that have notes", () => {
    // A conductor track carries tempo and nothing else; choosing it would produce an empty timing
    // track and read as a failed import.
    const file = midi([{ name: "Conductor", notes: [] }, { name: "Piano", notes: [[60, 0, 500]] }]);
    expect(midiTrackChoices(file)).toEqual(["Piano"]);
  });

  it("names an unnamed track by its position", () => {
    const file = midi([{ notes: [[60, 0, 500]] }, { notes: [[64, 0, 500]] }]);
    expect(midiTrackChoices(file)).toEqual([ALL_TRACKS, "Track 1", "Track 2"]);
    expect(timingTrackFromMidi(file, { track: "Track 2" }).labels![0]).toBe("E4");
  });

  it("says what it produced, including when that is nothing", () => {
    const file = midi([{ name: "Piano", notes: [[60, 0, 500]] }]);
    expect(describeMidiImport(timingTrackFromMidi(file), file)).toContain("1 labelled cells");
    const empty = midi([{ name: "Conductor", notes: [] }]);
    expect(describeMidiImport(timingTrackFromMidi(empty), empty)).toBe("No notes in that track.");
  });
});

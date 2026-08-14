import { describe, expect, it } from "vitest";
import { parseMidi } from "../src/midi";

// Small MIDI files assembled by hand. A fixture file would hide what each test is actually about;
// these are short enough to read, and every byte in them is one the parser has to handle.

function varInt(value: number): number[] {
  const out = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return out;
}

function chunk(type: string, body: number[]): number[] {
  const length = body.length;
  return [
    ...type.split("").map((c) => c.charCodeAt(0)),
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

function header(format: number, tracks: number, division: number): number[] {
  return chunk("MThd", [0, format, (tracks >> 8) & 0xff, tracks & 0xff, (division >> 8) & 0xff, division & 0xff]);
}

const END = [0x00, 0xff, 0x2f, 0x00];

function file(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

describe("MIDI files", () => {
  it("reads a note's pitch and its start and end in milliseconds", () => {
    // 480 ticks per quarter at the default 120bpm: a quarter note is 500ms.
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 60, 100, // C4 on
      ...varInt(480), 0x80, 60, 0, // off a quarter later
      ...END,
    ]);
    const parsed = parseMidi(file(header(0, 1, 480), track));

    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]!.notes).toEqual([{ midi: 60, startMs: 0, endMs: 500, velocity: 100 }]);
    expect(parsed.durationMs).toBe(500);
  });

  it("treats a note-on with velocity 0 as the note ending", () => {
    // The usual way to end a note in real files. Read as a start, every note would stay open.
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 62, 90,
      ...varInt(240), 0x90, 62, 0,
      ...END,
    ]);
    const parsed = parseMidi(file(header(0, 1, 480), track));
    expect(parsed.tracks[0]!.notes).toEqual([{ midi: 62, startMs: 0, endMs: 250, velocity: 90 }]);
  });

  it("follows running status", () => {
    // After one 0x90 the following note events omit their status byte entirely. A parser that
    // didn't track this would desynchronise and read note numbers as commands.
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 60, 100,
      ...varInt(0), 64, 100,
      ...varInt(0), 67, 100,
      ...varInt(480), 60, 0,
      ...varInt(0), 64, 0,
      ...varInt(0), 67, 0,
      ...END,
    ]);
    const parsed = parseMidi(file(header(0, 1, 480), track));
    expect(parsed.tracks[0]!.notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(parsed.tracks[0]!.notes.every((n) => n.startMs === 0 && n.endMs === 500)).toBe(true);
  });

  it("follows a tempo change", () => {
    // 250000us per quarter is 240bpm, so the second quarter note takes half as long as the first.
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 60, 100,
      ...varInt(480), 0x80, 60, 0,
      ...varInt(0), 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90,
      ...varInt(0), 0x90, 62, 100,
      ...varInt(480), 0x80, 62, 0,
      ...END,
    ]);
    const notes = parseMidi(file(header(0, 1, 480), track)).tracks[0]!.notes;
    expect(notes[0]).toMatchObject({ startMs: 0, endMs: 500 });
    expect(notes[1]).toMatchObject({ startMs: 500, endMs: 750 });
  });

  it("applies the tempo track's changes to the other tracks", () => {
    // Format 1 puts the tempo map in the first track alone; a per-track reading would leave every
    // other track running at the default tempo.
    const tempoTrack = chunk("MTrk", [...varInt(0), 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90, ...END]);
    const noteTrack = chunk("MTrk", [
      ...varInt(0), 0xff, 0x03, 5, ...("Piano".split("").map((c) => c.charCodeAt(0))),
      ...varInt(0), 0x90, 60, 100,
      ...varInt(480), 0x80, 60, 0,
      ...END,
    ]);
    const parsed = parseMidi(file(header(1, 2, 480), tempoTrack, noteTrack));
    expect(parsed.tracks[1]!.name).toBe("Piano");
    expect(parsed.tracks[1]!.notes[0]).toMatchObject({ startMs: 0, endMs: 250 });
  });

  it("skips the events it doesn't need without losing its place", () => {
    // Controller, pitch bend and program change all have different data lengths, and a wrong
    // guess at any of them turns the rest of the track into noise.
    const track = chunk("MTrk", [
      ...varInt(0), 0xb0, 7, 100, // controller: 2 data bytes
      ...varInt(0), 0xe0, 0, 64, // pitch bend: 2
      ...varInt(0), 0xc0, 5, // program change: 1
      ...varInt(0), 0xff, 0x01, 3, 65, 66, 67, // a text meta event
      ...varInt(0), 0x90, 72, 100,
      ...varInt(480), 0x80, 72, 0,
      ...END,
    ]);
    const parsed = parseMidi(file(header(0, 1, 480), track));
    expect(parsed.tracks[0]!.notes).toEqual([{ midi: 72, startMs: 0, endMs: 500, velocity: 100 }]);
  });

  it("pairs overlapping notes of the same pitch one at a time", () => {
    // Two note-ons for one pitch, then two offs. Closing all of them on the first off would give
    // one long note and one that never ends.
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 60, 100,
      ...varInt(240), 0x90, 60, 80,
      ...varInt(240), 0x80, 60, 0,
      ...varInt(240), 0x80, 60, 0,
      ...END,
    ]);
    const notes = parseMidi(file(header(0, 1, 480), track)).tracks[0]!.notes;
    expect(notes).toHaveLength(2);
    // The later note-on is closed by the first note-off, so the note that started first is the
    // long one. Output is ordered by start, not by which note finished first.
    expect(notes.map((n) => [n.startMs, n.endMs])).toEqual([
      [0, 750],
      [250, 500],
    ]);
  });

  it("reads an SMPTE division as absolute time, with no tempo involved", () => {
    // 25 frames per second, 40 ticks per frame: 1000 ticks is exactly one second.
    const division = ((256 - 25) << 8) | 40;
    const track = chunk("MTrk", [
      ...varInt(0), 0x90, 60, 100,
      ...varInt(1000), 0x80, 60, 0,
      ...END,
    ]);
    const notes = parseMidi(file(header(0, 1, division), track)).tracks[0]!.notes;
    expect(notes[0]).toMatchObject({ startMs: 0, endMs: 1000 });
  });

  it("rejects a file that isn't MIDI", () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a MIDI file/);
  });

  it("ignores a note-off with no note-on rather than inventing a note", () => {
    const track = chunk("MTrk", [...varInt(0), 0x80, 60, 0, ...END]);
    expect(parseMidi(file(header(0, 1, 480), track)).tracks[0]!.notes).toEqual([]);
  });
});

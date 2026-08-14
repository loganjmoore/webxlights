import type { RGBA } from "../color";
import { multiColorBlend, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { labelAt, splitLabel } from "../timing";
import { audioOf, type FrameContext } from "./types";

// SPEC/manual "Piano": "displays a piano keyboard effect where the keys modulate based on the beat
// and frequency of the sequence audio", or - the manual's preferred route - from the labels of a
// timing track: "the label can be the key letter or can be the MIDI value of the key".
//
// The two sources the manual lists that aren't here are an Audacity label file and a MIDI file.
// Both are a *file of notes over time*, which is the same thing a timing track is; the manual
// itself calls the track "the preferred option", and a MIDI file imported as a timing track drives
// this effect identically. What is genuinely missing is the MIDI import, not the effect.

export const PIANO_TYPES = ["True Piano", "Bars"] as const;
export type PianoType = (typeof PIANO_TYPES)[number];

export const PIANO_SOURCES = ["Timing Track", "Audio"] as const;
export type PianoSource = (typeof PIANO_SOURCES)[number];

export interface PianoParams {
  notesSource: PianoSource;
  timingTrack: string;
  type: PianoType;
  /** "The Start and End Midi channels defines the range that the Piano keys should emulate." */
  startMidi: number;
  endMidi: number;
  /** "If selected, then the Sharp and Flat 'Black' keys of the piano are shown and played." */
  showSharps: boolean;
  /** "Used to adjust the height of the effect vertically i.e. lengthen or shrink the effect." */
  verticalScalePct: number;
  /** "Controls the position of the effect horizontally i.e. can be shifted left or right." */
  horizontalOffsetPct: number;
}

const SEMITONE_OF: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_SEMITONES.has(((midi % 12) + 12) % 12);
}

/**
 * Parses one timing-track label into the MIDI notes it presses.
 *
 * The manual's three forms, verbatim: "1-127: midi codes / C4 or c#4: note and octave / C or C#:
 * notes (assumed to be 4th octave)", separated by "space, comma or colons".
 *
 * The note-and-octave form fixes the numbering: C4 is 60, so "C4" and "60" name the same key. (The
 * manual's table says 64 is Middle C; that would make the two forms disagree with each other, and
 * with every MIDI file a sequence might be built from.)
 */
export function parsePianoKeys(label: string): number[] {
  const out: number[] = [];
  for (const token of splitLabel(label)) {
    if (/^\d+$/.test(token)) {
      const midi = Number(token);
      if (midi >= 1 && midi <= 127) out.push(midi);
      continue;
    }
    const match = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(token);
    if (!match) continue;
    const semitone = SEMITONE_OF[match[1]!.toLowerCase()]!;
    const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    const octave = match[3] === undefined ? 4 : parseInt(match[3], 10);
    const midi = (octave + 1) * 12 + semitone + accidental;
    if (midi >= 0 && midi <= 127) out.push(midi);
  }
  return out;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * The name of a key, in the form `parsePianoKeys` reads back.
 *
 * The inverse of the note-and-octave form above, and used when a MIDI file is turned into timing
 * labels: a track labelled "C4 E4 G4" says what it is when you look at it, where "60 64 67"
 * doesn't. Sharps rather than flats, arbitrarily but consistently - the two name the same key.
 */
export function midiKeyName(midi: number): string {
  const semitone = ((midi % 12) + 12) % 12;
  return `${NOTE_NAMES[semitone]}${Math.floor(midi / 12) - 1}`;
}

/** The keys drawn, low to high - every key in range, or only the white ones. */
function keysInRange(params: PianoParams): number[] {
  const from = Math.max(0, Math.min(127, Math.round(params.startMidi)));
  const to = Math.max(0, Math.min(127, Math.round(params.endMidi)));
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const keys: number[] = [];
  for (let midi = lo; midi <= hi; midi++) {
    if (!params.showSharps && isBlackKey(midi)) continue;
    keys.push(midi);
  }
  return keys;
}

/**
 * Which keys are down, and how hard.
 *
 * A timing track presses a key outright. Audio has no notes in it, so the analysed spectrum is
 * spread across the keyboard and a band's own level becomes that key's pressure - which is what
 * "the keys modulate based on the beat and frequency of the sequence audio" describes, and it
 * keeps the effect useful on a sequence nobody has transcribed.
 */
function pressedKeys(params: PianoParams, ctx: FrameContext, keys: number[]): Map<number, number> {
  const pressed = new Map<number, number>();

  if (params.notesSource === "Audio") {
    if (!ctx.audio) return pressed;
    const bands = audioOf(ctx).bands;
    if (bands.length === 0) return pressed;
    keys.forEach((midi, i) => {
      const band = bands[Math.min(bands.length - 1, Math.floor((i / Math.max(1, keys.length)) * bands.length))] ?? 0;
      // Below this a band is room noise rather than a note; without a floor every key is always
      // very slightly down and the keyboard reads as a solid block.
      if (band >= 0.2) pressed.set(midi, Math.min(1, band));
    });
    return pressed;
  }

  const cell = ctx.clock ? labelAt(ctx.data?.timing ?? [], ctx.clock.atMs) : undefined;
  if (!cell) return pressed;
  for (const midi of parsePianoKeys(cell.label)) pressed.set(midi, 1);
  return pressed;
}

function scale(color: RGBA, amount: number): RGBA {
  return rgba(Math.round(color.r * amount), Math.round(color.g * amount), Math.round(color.b * amount), color.a);
}

export function renderPiano(buffer: RenderBuffer, palette: RGBA[], params: PianoParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const keys = keysInRange(params);
  if (keys.length === 0) return;

  const pressed = pressedKeys(params, ctx, keys);
  const keyHeight = Math.max(1, Math.round((H * Math.max(0, params.verticalScalePct)) / 100));
  const offset = (params.horizontalOffsetPct / 100) * W;

  const colorFor = (index: number, pressure: number): RGBA => {
    const base =
      palette.length > 0 ? multiColorBlend(palette, keys.length > 1 ? index / (keys.length - 1) : 0) : rgba(255, 255, 255);
    return scale(base, pressure);
  };

  const paint = (x0: number, x1: number, y0: number, y1: number, color: RGBA): void => {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      for (let y = y0; y < y1; y++) buffer.setPixel(x, y, color);
    }
  };

  if (params.type === "Bars") {
    // Bars is the abstract reading of the keyboard: one column per key, and only what is playing
    // is drawn. On a matrix that is what reads from across a yard.
    const width = W / keys.length;
    keys.forEach((midi, i) => {
      const pressure = pressed.get(midi);
      if (pressure === undefined) return;
      paint(offset + i * width, offset + (i + 1) * width, 0, keyHeight, colorFor(i, pressure));
    });
    return;
  }

  // "True Piano": the whites carry the layout and the blacks sit between them, so the keyboard is
  // recognisable as one - a key you can point at rather than a bar chart.
  const whites = keys.filter((midi) => !isBlackKey(midi));
  if (whites.length === 0) return;
  const whiteWidth = W / whites.length;

  whites.forEach((midi, i) => {
    const pressure = pressed.get(midi);
    const color = pressure === undefined ? rgba(80, 80, 80) : colorFor(keys.indexOf(midi), pressure);
    paint(offset + i * whiteWidth, offset + (i + 1) * whiteWidth, 0, keyHeight, color);
  });

  if (!params.showSharps) return;

  // A black key sits on the seam after the white below it, is narrower, and stops short of the
  // bottom - the three things that make a keyboard look like a keyboard.
  const blackWidth = Math.max(1, whiteWidth * 0.6);
  const blackBottom = Math.round(keyHeight * 0.4);
  for (const midi of keys) {
    if (!isBlackKey(midi)) continue;
    const whitesBelow = whites.filter((w) => w < midi).length;
    if (whitesBelow === 0 || whitesBelow >= whites.length) continue; // hangs off the end of the range
    const seam = offset + whitesBelow * whiteWidth;
    const pressure = pressed.get(midi);
    const color = pressure === undefined ? rgba(10, 10, 10) : colorFor(keys.indexOf(midi), pressure);
    paint(seam - blackWidth / 2, seam + blackWidth / 2, blackBottom, keyHeight, color);
  }
}

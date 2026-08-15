import type { RGBA } from "../color";
import { multiColorBlend, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { labelAt } from "../timing";
import { parsePianoKeys } from "./piano";
import type { FrameContext } from "./types";

// The Guitar effect: "turns MIDI note data into an animated stringed-instrument visualization.
// Using note data from a MIDI timing track it lights up strings and fret positions in time with
// the music, and can be styled as a guitar, bass guitar, banjo or violin."
//
// Buildable because the hard part already exists: a MIDI file imports as a timing track whose
// labels are the keys sounding, and the Piano effect already reads exactly that. This is the same
// data seen from a different instrument - a note is a position along a string rather than a key.

export const GUITAR_TYPES = ["Guitar", "Bass Guitar", "Banjo", "Violin"] as const;
export type GuitarType = (typeof GUITAR_TYPES)[number];

export const STRING_APPEARANCES = ["On", "Wave"] as const;
export type StringAppearance = (typeof STRING_APPEARANCES)[number];

export interface GuitarParams {
  type: GuitarType;
  timingTrack: string;
  stringAppearance: StringAppearance;
  fretCount: number;
  baseWavelength: number;
  varyWavelengthByString: number;
  varyWavelengthByFret: number;
  fade: boolean;
  collapse: boolean;
  showStrings: boolean;
}

/**
 * The open-string notes of each instrument, low to high, as MIDI numbers.
 *
 * Standard tunings: guitar EADGBE from E2, bass EADG from E1, banjo in open G (with the short
 * fifth string listed last, where it sits on the instrument), violin GDAE in fifths from G3.
 * These decide which string a note lands on, so they are the instrument rather than decoration.
 */
export const OPEN_STRINGS: Record<GuitarType, number[]> = {
  Guitar: [40, 45, 50, 55, 59, 64],
  "Bass Guitar": [28, 33, 38, 43],
  Banjo: [50, 55, 59, 62, 67],
  Violin: [55, 62, 69, 76],
};

export interface FretPosition {
  /** Index into the instrument's strings, 0 being the lowest. */
  stringIndex: number;
  /** 0 is the open string. */
  fret: number;
}

/**
 * Where a note is played, or null if the instrument can't reach it.
 *
 * The *highest* string that can play the note, which is how it is actually fingered: a guitarist
 * plays middle C on the B string at the first fret, not on the low E at the eighth, because that
 * is where the hand already is. Picking the lowest string instead would send a melody sliding down
 * the neck as it rose in pitch, which is both wrong and unreadable.
 */
export function fretFor(type: GuitarType, midi: number, fretCount: number): FretPosition | null {
  const strings = OPEN_STRINGS[type];
  for (let stringIndex = strings.length - 1; stringIndex >= 0; stringIndex--) {
    const fret = midi - strings[stringIndex]!;
    if (fret >= 0 && fret <= fretCount) return { stringIndex, fret };
  }
  return null;
}

/** How bright a note is, given how far through its own duration the frame is. */
export function noteBrightness(progress01: number, fade: boolean): number {
  if (!fade) return 1;
  // "Enables note fade-out via alpha transparency" - a plucked string decays, so a note held
  // across a bar shouldn't stay as bright as the moment it was struck.
  return Math.max(0, 1 - Math.max(0, Math.min(1, progress01)));
}

/**
 * The wavelength of a string's wave, in buffer columns.
 *
 * Thicker strings vibrate slower, and a note fretted higher up shortens the vibrating length -
 * both of which the manual exposes as knobs rather than deriving, so both are applied as
 * multipliers on the base rather than as physics.
 */
export function wavelengthFor(params: GuitarParams, stringIndex: number, fret: number): number {
  const byString = 1 + params.varyWavelengthByString * (stringIndex / Math.max(1, OPEN_STRINGS[params.type].length - 1));
  const byFret = 1 + params.varyWavelengthByFret * (fret / Math.max(1, params.fretCount));
  return Math.max(0.5, params.baseWavelength * byString * byFret);
}

export function renderGuitar(buffer: RenderBuffer, colors: RGBA[], params: GuitarParams, ctx: FrameContext): void {
  const strings = OPEN_STRINGS[params.type];
  // The named track is resolved by the caller onto ctx.data.timing - a row renders in isolation
  // and knows nothing of the sequence around it, which is why the effect doesn't look it up.
  const track = ctx.data?.timing;
  const cell = track ? labelAt(track, ctx.clock?.atMs ?? 0) : null;

  const rowHeight = buffer.height / strings.length;
  const sounding = cell ? parsePianoKeys(cell.label) : [];
  const positions = sounding
    .map((midi) => fretFor(params.type, midi, params.fretCount))
    .filter((p): p is FretPosition => p !== null);

  // How far through the cell the frame is, which is what the fade and the collapse both run on.
  const progress =
    cell && cell.endMs > cell.startMs ? ((ctx.clock?.atMs ?? 0) - cell.startMs) / (cell.endMs - cell.startMs) : 0;

  for (let stringIndex = 0; stringIndex < strings.length; stringIndex++) {
    // Lowest string at the bottom, which is how the instrument is held and drawn.
    const centreY = rowHeight * (stringIndex + 0.5);
    const played = positions.filter((p) => p.stringIndex === stringIndex);
    const color = multiColorBlend(colors, strings.length === 1 ? 0 : stringIndex / (strings.length - 1));

    for (const position of played) {
      // "Shrinks string height during note duration": the vibrating length narrows as the note
      // dies away, which is the visual the manual is after rather than a literal string.
      const half = (rowHeight / 2) * (params.collapse ? Math.max(0.15, 1 - progress) : 1);
      const brightness = noteBrightness(progress, params.fade);
      // A fretted note lights the string from the nut up to the fret; the rest is the part still
      // free to vibrate, which is what "Show Strings" draws.
      const fretX = Math.round((position.fret / Math.max(1, params.fretCount)) * buffer.width);
      const wavelength = wavelengthFor(params, stringIndex, position.fret);

      for (let x = 0; x < buffer.width; x++) {
        const beyondFret = x > fretX;
        if (beyondFret && !params.showStrings) continue;
        const amplitude =
          params.stringAppearance === "Wave" && beyondFret ? Math.sin((x / wavelength) * Math.PI * 2 + progress * Math.PI * 2) : 0;
        const y = Math.round(centreY + amplitude * half);
        const lit = beyondFret ? brightness * 0.5 : brightness;
        if (lit <= 0) continue;
        buffer.setPixel(x, y, rgba(color.r, color.g, color.b, Math.round(255 * lit)));
      }
    }

    // An unplayed string is still there, faintly, when Show Strings is on - otherwise the
    // instrument disappears between notes and there is nothing to read the frets against.
    if (played.length === 0 && params.showStrings) {
      const y = Math.round(centreY);
      for (let x = 0; x < buffer.width; x++) buffer.setPixel(x, y, rgba(color.r, color.g, color.b, 40));
    }
  }
}

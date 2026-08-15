import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { OPEN_STRINGS, fretFor, noteBrightness, renderGuitar, wavelengthFor, type GuitarParams } from "../src/effects/guitar";
import type { FrameContext } from "../src/effects/types";

const params: GuitarParams = {
  type: "Guitar",
  timingTrack: "Notes",
  stringAppearance: "On",
  fretCount: 19,
  baseWavelength: 4,
  varyWavelengthByString: 0,
  varyWavelengthByFret: 0,
  fade: false,
  collapse: false,
  showStrings: true,
};

function ctxWith(label: string, atMs = 0): FrameContext {
  return {
    clock: { atMs, startMs: 0, endMs: 1000, frameMs: 50 },
    data: { timing: [{ label, startMs: 0, endMs: 1000 }] },
  } as unknown as FrameContext;
}

describe("where a note is played", () => {
  it("finds an open string", () => {
    // Low E on a guitar is the open sixth string.
    expect(fretFor("Guitar", OPEN_STRINGS.Guitar[0]!, 19)).toEqual({ stringIndex: 0, fret: 0 });
  });

  it("prefers the highest string that can reach the note", () => {
    // How it is actually fingered: middle C is played on the B string at the first fret, not on
    // the low E at the eighth, because that is where the hand already is. Picking the lowest
    // string would send a melody sliding *down* the neck as it rose in pitch.
    const middleC = 60;
    const position = fretFor("Guitar", middleC, 19)!;
    expect(position.stringIndex).toBe(4); // the B string
    expect(position.fret).toBe(1);
  });

  it("is nothing for a note the instrument can't reach", () => {
    expect(fretFor("Guitar", 20, 19)).toBeNull(); // below the low E
    expect(fretFor("Guitar", 127, 19)).toBeNull(); // far above the top fret
  });

  it("respects a shortened neck", () => {
    // A note reachable at fret 12 is not reachable when only 8 frets are shown, so it moves to a
    // lower string or disappears - it must not silently render at a fret that isn't drawn.
    const note = OPEN_STRINGS.Guitar[5]! + 12;
    expect(fretFor("Guitar", note, 19)).toEqual({ stringIndex: 5, fret: 12 });
    expect(fretFor("Guitar", note, 8)).toBeNull();
  });

  it("knows each instrument's own tuning", () => {
    expect(OPEN_STRINGS.Guitar).toHaveLength(6);
    expect(OPEN_STRINGS["Bass Guitar"]).toHaveLength(4);
    expect(OPEN_STRINGS.Violin).toHaveLength(4);
    // A violin is tuned in fifths, so every gap is seven semitones.
    const violin = OPEN_STRINGS.Violin;
    for (let i = 1; i < violin.length; i++) expect(violin[i]! - violin[i - 1]!).toBe(7);
  });
});

describe("a note's brightness over its own duration", () => {
  it("is constant without fade", () => {
    expect(noteBrightness(0, false)).toBe(1);
    expect(noteBrightness(0.9, false)).toBe(1);
  });

  it("decays with fade, because a plucked string decays", () => {
    expect(noteBrightness(0, true)).toBe(1);
    expect(noteBrightness(0.5, true)).toBeCloseTo(0.5);
    expect(noteBrightness(1, true)).toBe(0);
  });

  it("never goes negative for a frame past the end of its cell", () => {
    expect(noteBrightness(3, true)).toBe(0);
  });
});

describe("wavelength", () => {
  it("is the base when neither variation is asked for", () => {
    expect(wavelengthFor(params, 3, 5)).toBe(params.baseWavelength);
  });

  it("grows with the string and the fret when asked", () => {
    const byString = wavelengthFor({ ...params, varyWavelengthByString: 2 }, 5, 0);
    expect(byString).toBeGreaterThan(params.baseWavelength);
    const byFret = wavelengthFor({ ...params, varyWavelengthByFret: 2 }, 0, 19);
    expect(byFret).toBeGreaterThan(params.baseWavelength);
  });

  it("never reaches zero, which would divide by nothing", () => {
    expect(wavelengthFor({ ...params, baseWavelength: 0 }, 0, 0)).toBeGreaterThan(0);
  });
});

describe("rendering", () => {
  const palette = [rgba(255, 0, 0, 255), rgba(0, 0, 255, 255)];

  it("lights a string when its note is sounding", () => {
    const buffer = new RenderBuffer(20, 12);
    renderGuitar(buffer, palette, params, ctxWith("E2"));
    let lit = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if (buffer.getPixel(x, y).a > 100) lit++;
    expect(lit).toBeGreaterThan(0);
  });

  it("draws the instrument faintly between notes when Show Strings is on", () => {
    // Otherwise it disappears and there is nothing to read the frets against.
    const buffer = new RenderBuffer(20, 12);
    renderGuitar(buffer, palette, params, ctxWith(""));
    let faint = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) if (buffer.getPixel(x, y).a > 0) faint++;
    expect(faint).toBeGreaterThan(0);
  });

  it("draws nothing at all with no track and no strings shown", () => {
    const buffer = new RenderBuffer(20, 12);
    renderGuitar(buffer, palette, { ...params, showStrings: false }, { clock: { atMs: 0, startMs: 0, endMs: 1000, frameMs: 50 } } as FrameContext);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) expect(buffer.getPixel(x, y).a).toBe(0);
  });

  it("renders the same frame twice the same way", () => {
    // The determinism rule: an effect must render identically when scrubbed and when exported.
    const a = new RenderBuffer(20, 12);
    const b = new RenderBuffer(20, 12);
    renderGuitar(a, palette, { ...params, stringAppearance: "Wave" }, ctxWith("E2 A2", 400));
    renderGuitar(b, palette, { ...params, stringAppearance: "Wave" }, ctxWith("E2 A2", 400));
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 20; x++) expect(a.getPixel(x, y), `${x},${y}`).toEqual(b.getPixel(x, y));
    }
  });
});

import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { isBlackKey, parsePianoKeys, renderPiano, type PianoParams } from "../src/effects/piano";
import { labelsFromTrack } from "../src/timing";
import type { FrameContext } from "../src/effects/types";

const WHITE = rgba(255, 255, 255);

const DEFAULTS: PianoParams = {
  notesSource: "Timing Track",
  timingTrack: "Notes",
  type: "True Piano",
  startMidi: 60, // C4
  endMidi: 72, // C5
  showSharps: true,
  verticalScalePct: 100,
  horizontalOffsetPct: 0,
};

function ctxAt(atMs: number, over: Partial<FrameContext> = {}): FrameContext {
  return { frameIndexInEffect: 0, positionInEffect01: 0, seed: 1, clock: { atMs, startMs: 0, endMs: 1000 }, ...over };
}

describe("piano key labels", () => {
  it("reads the manual's three forms", () => {
    expect(parsePianoKeys("60")).toEqual([60]); // midi code
    expect(parsePianoKeys("C4")).toEqual([60]); // note and octave
    expect(parsePianoKeys("C")).toEqual([60]); // note alone: "assumed to be 4th octave"
    expect(parsePianoKeys("c#4")).toEqual([61]);
  });

  it("presses several keys from one label", () => {
    // "You can use a value of C# to depress the C# key, C to depress the C key or multiple values
    // such as C F A to depress three keys."
    expect(parsePianoKeys("C F A")).toEqual([60, 65, 69]);
    expect(parsePianoKeys("60,64:67")).toEqual([60, 64, 67]);
  });

  it("agrees with itself across the two forms", () => {
    // If the note-name form and the midi-code form disagreed, the same key would have two names
    // and a MIDI-derived track would be transposed against a hand-typed one.
    expect(parsePianoKeys("C4")).toEqual(parsePianoKeys("60"));
    expect(parsePianoKeys("A4")).toEqual(parsePianoKeys("69"));
  });

  it("ignores what isn't a key", () => {
    expect(parsePianoKeys("verse chorus")).toEqual([]);
    expect(parsePianoKeys("999")).toEqual([]); // outside 1-127
    expect(parsePianoKeys("")).toEqual([]);
  });

  it("knows which keys are black", () => {
    expect(isBlackKey(61)).toBe(true); // C#4
    expect(isBlackKey(60)).toBe(false); // C4
  });
});

describe("Piano effect", () => {
  const track = labelsFromTrack([0, 500, 1000], ["C4", "G4"]);

  function litColumns(buffer: RenderBuffer, y: number): number[] {
    const out: number[] = [];
    for (let x = 0; x < buffer.width; x++) {
      const c = buffer.getPixel(x, y);
      if (c.r > 150 && c.g > 150 && c.b > 150) out.push(x);
    }
    return out;
  }

  it("presses the key the timing track names, and a different one later", () => {
    const first = new RenderBuffer(16, 8);
    renderPiano(first, [WHITE], DEFAULTS, ctxAt(100, { data: { timing: track } }));
    const later = new RenderBuffer(16, 8);
    renderPiano(later, [WHITE], DEFAULTS, ctxAt(700, { data: { timing: track } }));

    const a = litColumns(first, 0);
    const b = litColumns(later, 0);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // C4 is the left-hand end of this range and G4 is past the middle.
    expect(Math.min(...a)).toBeLessThan(Math.min(...b));
  });

  it("draws the keyboard even with nothing pressed - True Piano is a keyboard, not a bar chart", () => {
    const buffer = new RenderBuffer(16, 8);
    renderPiano(buffer, [WHITE], DEFAULTS, ctxAt(100, { data: { timing: [] } }));
    let painted = 0;
    for (let x = 0; x < buffer.width; x++) if (buffer.getPixel(x, 0).a > 0) painted++;
    expect(painted).toBe(16);
    // ...but nothing is lit, because nothing is being played.
    expect(litColumns(buffer, 0)).toEqual([]);
  });

  it("Bars draws only what is playing", () => {
    const buffer = new RenderBuffer(16, 8);
    renderPiano(buffer, [WHITE], { ...DEFAULTS, type: "Bars" }, ctxAt(100, { data: { timing: track } }));
    let painted = 0;
    for (let x = 0; x < buffer.width; x++) if (buffer.getPixel(x, 0).a > 0) painted++;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(16);
  });

  it("hides the black keys when asked, and doesn't play them either", () => {
    const withSharps = new RenderBuffer(24, 8);
    renderPiano(withSharps, [WHITE], { ...DEFAULTS, type: "Bars" }, ctxAt(100, { data: { timing: labelsFromTrack([0, 1000], ["C#4"]) } }));
    let sharpPixels = 0;
    for (let x = 0; x < withSharps.width; x++) if (withSharps.getPixel(x, 0).a > 0) sharpPixels++;
    expect(sharpPixels).toBeGreaterThan(0);

    const without = new RenderBuffer(24, 8);
    renderPiano(
      without,
      [WHITE],
      { ...DEFAULTS, type: "Bars", showSharps: false },
      ctxAt(100, { data: { timing: labelsFromTrack([0, 1000], ["C#4"]) } }),
    );
    let flatPixels = 0;
    for (let x = 0; x < without.width; x++) if (without.getPixel(x, 0).a > 0) flatPixels++;
    expect(flatPixels).toBe(0); // the key isn't shown, so it isn't played
  });

  it("Vertical Scale shortens the keyboard", () => {
    const full = new RenderBuffer(16, 10);
    renderPiano(full, [WHITE], DEFAULTS, ctxAt(100, { data: { timing: track } }));
    const half = new RenderBuffer(16, 10);
    renderPiano(half, [WHITE], { ...DEFAULTS, verticalScalePct: 50 }, ctxAt(100, { data: { timing: track } }));

    const height = (buffer: RenderBuffer): number => {
      let rows = 0;
      for (let y = 0; y < buffer.height; y++) if (buffer.getPixel(0, y).a > 0) rows++;
      return rows;
    };
    expect(height(full)).toBe(10);
    expect(height(half)).toBe(5);
  });

  it("Horizontal Offset shifts the keyboard sideways", () => {
    const centred = new RenderBuffer(16, 8);
    renderPiano(centred, [WHITE], { ...DEFAULTS, type: "Bars" }, ctxAt(100, { data: { timing: track } }));
    const shifted = new RenderBuffer(16, 8);
    renderPiano(shifted, [WHITE], { ...DEFAULTS, type: "Bars", horizontalOffsetPct: 50 }, ctxAt(100, { data: { timing: track } }));
    expect(Math.min(...litColumns(shifted, 0))).toBeGreaterThan(Math.min(...litColumns(centred, 0)));
  });

  it("with the audio source and no audio loaded, plays nothing rather than everything", () => {
    const buffer = new RenderBuffer(16, 8);
    renderPiano(buffer, [WHITE], { ...DEFAULTS, type: "Bars", notesSource: "Audio" }, ctxAt(100));
    for (let x = 0; x < buffer.width; x++) expect(buffer.getPixel(x, 0).a).toBe(0);
  });

  it("with the audio source, a loud band presses the keys under it", () => {
    const buffer = new RenderBuffer(16, 8);
    renderPiano(buffer, [WHITE], { ...DEFAULTS, type: "Bars", notesSource: "Audio" }, {
      ...ctxAt(100),
      audio: { level: 0.9, bands: [0.9, 0, 0, 0] },
    });
    const on: number[] = [];
    for (let x = 0; x < buffer.width; x++) if (buffer.getPixel(x, 0).a > 0) on.push(x);
    expect(on.length).toBeGreaterThan(0);
    // The low band is the low keys: everything lit is in the left quarter of the keyboard.
    expect(Math.max(...on)).toBeLessThan(buffer.width / 2);
  });
});

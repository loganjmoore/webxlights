import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import type { AudioFrame } from "../src/audio";
import { VU_METER_TYPES, renderVuMeter, type VuMeterParams } from "../src/effects/vuMeter";
import { labelsFromTrack } from "../src/timing";

const PALETTE = [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)];
const BASE: VuMeterParams = { type: "Spectrogram", bars: 4, gainPct: 100, sensitivityPct: 50, timingTrack: "", startNote: 48, endNote: 84 };

function frame(level: number, bands: number[]): AudioFrame {
  return { level, bands };
}

function render(params: Partial<VuMeterParams>, audio: AudioFrame | undefined, w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderVuMeter(buf, PALETTE, { ...BASE, ...params }, { frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1, audio });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

function columnHeight(buf: RenderBuffer, x: number): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("VU Meter effect (SPEC ch8)", () => {
  it("renders nothing when the sequence has no audio loaded", () => {
    for (const type of VU_METER_TYPES) {
      expect(litCount(render({ type }, undefined)), `${type} with no audio`).toBe(0);
    }
  });

  it("Spectrum draws each band at its own height", () => {
    const buf = render({ type: "Spectrogram", bars: 4 }, frame(1, [1, 0.5, 0.25, 0]));
    expect(columnHeight(buf, 0)).toBe(16);
    expect(columnHeight(buf, 4)).toBe(8);
    expect(columnHeight(buf, 8)).toBe(4);
    expect(columnHeight(buf, 12)).toBe(0);
  });

  it("Volume Bars draws every bar at the overall level", () => {
    const buf = render({ type: "Volume Bars", bars: 4 }, frame(0.5, [1, 0, 0, 0]));
    expect(columnHeight(buf, 0)).toBe(8);
    expect(columnHeight(buf, 12)).toBe(8);
  });

  it("Level Bar fills the whole width to the level's height", () => {
    const buf = render({ type: "Level Bar" }, frame(0.25, []));
    expect(columnHeight(buf, 0)).toBe(4);
    expect(columnHeight(buf, 15)).toBe(4);
  });

  it("Level Pulse only fires above the sensitivity threshold", () => {
    expect(litCount(render({ type: "Level Pulse", sensitivityPct: 60 }, frame(0.3, [])))).toBe(0);
    expect(litCount(render({ type: "Level Pulse", sensitivityPct: 60 }, frame(0.9, [])))).toBe(16 * 16);
  });

  it("gain scales the analysed level", () => {
    const quiet = render({ type: "Level Bar", gainPct: 100 }, frame(0.25, []));
    const boosted = render({ type: "Level Bar", gainPct: 300 }, frame(0.25, []));
    expect(columnHeight(boosted, 0)).toBeGreaterThan(columnHeight(quiet, 0));
  });

  it("gain clamps at full scale rather than overflowing the buffer", () => {
    const buf = render({ type: "Level Bar", gainPct: 300 }, frame(1, []));
    expect(columnHeight(buf, 0)).toBe(16);
  });

  it("Level Color picks a colour from the palette by level", () => {
    const low = render({ type: "Level Color" }, frame(0.05, [])).getPixel(0, 0);
    const high = render({ type: "Level Color" }, frame(0.95, [])).getPixel(0, 0);
    expect(low).not.toEqual(high);
  });

  it("Intensity Wave brightness follows the level", () => {
    const brightest = (buf: RenderBuffer): number => {
      let max = 0;
      for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) max = Math.max(max, buf.getPixel(x, y).a);
      return max;
    };
    expect(brightest(render({ type: "Intensity Wave" }, frame(1, [])))).toBeGreaterThan(
      brightest(render({ type: "Intensity Wave" }, frame(0.2, []))),
    );
  });

  it("Waveform draws around the vertical centre rather than from the floor", () => {
    const buf = render({ type: "Waveform", bars: 4 }, frame(1, [1, 1, 1, 1]));
    expect(buf.getPixel(0, 7).a).toBeGreaterThan(0); // centred
    expect(buf.getPixel(0, 0).a).toBeGreaterThan(0); // reaches the edges at full level
    const quiet = render({ type: "Waveform", bars: 4 }, frame(0.1, [0.05, 0.05, 0.05, 0.05]));
    expect(quiet.getPixel(0, 0).a).toBe(0); // a quiet passage stays near the middle
    expect(quiet.getPixel(0, 7).a).toBeGreaterThan(0);
  });

  it("resamples the analysed bands onto whatever bar count is asked for", () => {
    expect(() => render({ type: "Spectrogram", bars: 32 }, frame(1, [1, 0.5]))).not.toThrow();
    expect(litCount(render({ type: "Spectrogram", bars: 32 }, frame(1, [1, 0.5])))).toBeGreaterThan(0);
  });
});

describe("the name Spectrogram used to have", () => {
  it("still renders for a sequence that says Spectrum", () => {
    // Renaming the type to the manual's own name would otherwise turn every stored effect that
    // says "Spectrum" into an unknown type, which renders nothing and looks like data loss.
    const legacy = render({ type: "Spectrum" }, frame(1, [1, 1, 1, 1]));
    const current = render({ type: "Spectrogram" }, frame(1, [1, 1, 1, 1]));
    expect(litCount(legacy)).toBeGreaterThan(0);
    expect(litCount(legacy)).toBe(litCount(current));
  });

  it("is not offered as a choice any more", () => {
    expect(VU_METER_TYPES).not.toContain("Spectrum");
    expect(VU_METER_TYPES).toContain("Spectrogram");
  });
});

// The timing-event half. These types don't read the audio at all - they read the marks, which is
// what made them buildable once effects could see a timing track.
describe("VU Meter timing-event types", () => {
  const cells = labelsFromTrack([0, 1000, 2000, 3000], ["a", "b", "c"]);

  function renderAt(type: VuMeterParams["type"], atMs: number, over: Partial<VuMeterParams> = {}, w = 16, h = 8): RenderBuffer {
    const buf = new RenderBuffer(w, h);
    renderVuMeter(buf, PALETTE, { ...BASE, type, ...over }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      audio: frame(1, [1, 1, 1, 1]),
      clock: { atMs, startMs: 0, endMs: 3000, frameMs: 50 },
      data: { timing: cells },
    });
    return buf;
  }

  function litColumns(buf: RenderBuffer): number[] {
    const out: number[] = [];
    for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, 0).a > 0) out.push(x);
    return out;
  }

  it("renders nothing without a timing track, rather than falling back to the audio", () => {
    const buf = new RenderBuffer(16, 8);
    renderVuMeter(buf, PALETTE, { ...BASE, type: "Timing Event Bar" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      audio: frame(1, [1, 1, 1, 1]),
      clock: { atMs: 500, startMs: 0, endMs: 3000, frameMs: 50 },
    });
    expect(litCount(buf)).toBe(0);
  });

  it("renders without any audio at all, because the marks are the source", () => {
    const buf = new RenderBuffer(16, 8);
    renderVuMeter(buf, PALETTE, { ...BASE, type: "Timing Event Color" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      clock: { atMs: 500, startMs: 0, endMs: 3000, frameMs: 50 },
      data: { timing: cells },
    });
    expect(litCount(buf)).toBeGreaterThan(0);
  });

  it("Timing Event Bar steps one bar along with each mark", () => {
    expect(litColumns(renderAt("Timing Event Bar", 100))).toEqual([0, 1, 2, 3]);
    expect(litColumns(renderAt("Timing Event Bar", 1100))).toEqual([4, 5, 6, 7]);
    expect(litColumns(renderAt("Timing Event Bar", 2100))).toEqual([8, 9, 10, 11]);
  });

  it("Timing Event Bars adds a bar with each mark instead of moving one", () => {
    expect(litColumns(renderAt("Timing Event Bars", 100))).toEqual([0, 1, 2, 3]);
    expect(litColumns(renderAt("Timing Event Bars", 1100))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("Timing Event Spike sweeps across the cell rather than jumping per mark", () => {
    const early = litColumns(renderAt("Timing Event Spike", 100));
    const late = litColumns(renderAt("Timing Event Spike", 900));
    expect(Math.min(...early)).toBeLessThan(Math.min(...late));
  });

  it("the timed sweep crosses in exactly one cell, so tighter marks sweep faster", () => {
    const tight = labelsFromTrack([0, 200, 400], ["a", "b"]);
    const buf = new RenderBuffer(16, 8);
    renderVuMeter(buf, PALETTE, { ...BASE, type: "Timing Event Timed Sweep" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      clock: { atMs: 180, startMs: 0, endMs: 400, frameMs: 50 },
      data: { timing: tight },
    });
    // 90% through a 200ms cell, so the bar is near the right-hand end.
    expect(Math.min(...litColumns(buf))).toBeGreaterThan(8);
  });

  it("the alternating sweep runs the other way on every second mark", () => {
    const forward = litColumns(renderAt("Timing Event Alternate Timed Sweep", 100));
    const backward = litColumns(renderAt("Timing Event Alternate Timed Sweep", 1100));
    // Same distance into the cell, opposite ends of the buffer.
    expect(Math.min(...forward)).toBeLessThan(4);
    expect(Math.min(...backward)).toBeGreaterThan(8);
  });

  it("Timing Event Color takes a different palette colour on each mark", () => {
    const first = renderAt("Timing Event Color", 100).getPixel(0, 0);
    const second = renderAt("Timing Event Color", 1100).getPixel(0, 0);
    expect(first).not.toEqual(second);
  });

  it("Timing Event Pulse fades out after its mark", () => {
    const atMark = renderAt("Timing Event Pulse", 0).getPixel(0, 0).a;
    const later = renderAt("Timing Event Pulse", 200).getPixel(0, 0).a;
    const wellAfter = renderAt("Timing Event Pulse", 900).getPixel(0, 0).a;
    expect(atMark).toBeGreaterThan(later);
    expect(wellAfter).toBe(0);
  });

  it("Timing Event Jump 100 fills the height at the mark, whatever the audio is doing", () => {
    const buf = new RenderBuffer(16, 8);
    renderVuMeter(buf, PALETTE, { ...BASE, type: "Timing Event Jump 100" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0,
      seed: 1,
      audio: frame(0.05, [0.05]),
      clock: { atMs: 0, startMs: 0, endMs: 3000, frameMs: 50 },
      data: { timing: cells },
    });
    for (let y = 0; y < 8; y++) expect(buf.getPixel(0, y).a).toBeGreaterThan(0);
  });
});

describe("VU Meter level types", () => {
  function withHistory(type: VuMeterParams["type"], atMs: number, levels: number[]): RenderBuffer {
    const buf = new RenderBuffer(8, 8);
    // A level per 50ms frame, so a threshold crossing has a real moment attached to it.
    const at = (ms: number) => frame(levels[Math.max(0, Math.min(levels.length - 1, Math.round(ms / 50)))] ?? 0, [0]);
    renderVuMeter(buf, PALETTE, { ...BASE, type, sensitivityPct: 50, bars: 1 }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      audio: at(atMs),
      audioAt: at,
      clock: { atMs, startMs: 0, endMs: 1000, frameMs: 50 },
    });
    return buf;
  }

  it("Level Jump falls back after the crossing rather than staying up", () => {
    // Quiet, then one loud frame at 100ms, then quiet again.
    const levels = [0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const atCrossing = litCount(withHistory("Level Jump", 100, levels));
    const soonAfter = litCount(withHistory("Level Jump", 300, levels));
    const longAfter = litCount(withHistory("Level Jump", 900, levels));
    expect(atCrossing).toBeGreaterThan(soonAfter);
    expect(longAfter).toBe(0);
  });

  it("Level Jump 100 fills the height regardless of how loud the crossing was", () => {
    const levels = [0.1, 0.1, 0.55, ...new Array(20).fill(0.1)];
    expect(litCount(withHistory("Level Jump 100", 100, levels))).toBe(64);
  });

  it("On follows the volume, and Color On follows it with colour", () => {
    const quiet = render({ type: "On", bars: 1 }, frame(0.2, [0.2])).getPixel(0, 0);
    const loud = render({ type: "On", bars: 1 }, frame(1, [1])).getPixel(0, 0);
    expect(loud.a).toBeGreaterThan(quiet.a);

    const quietColor = render({ type: "Color On" }, frame(0.1, [0.1])).getPixel(0, 0);
    const loudColor = render({ type: "Color On" }, frame(1, [1])).getPixel(0, 0);
    expect(quietColor).not.toEqual(loudColor);
  });

  it("Spectrogram Line draws one pixel per column, not a filled bar", () => {
    const line = render({ type: "Spectrogram Line" }, frame(1, [1, 1, 1, 1]), 8, 8);
    expect(litCount(line)).toBe(8);
  });

  it("Spectrogram Peak draws the peak line in the last palette colour", () => {
    const peak = render({ type: "Spectrogram Peak" }, frame(1, [0.5, 0.5, 0.5, 0.5]), 8, 8);
    let found = false;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = peak.getPixel(x, y);
        if (c.r === 0 && c.g === 0 && c.b === 255) found = true;
      }
    }
    expect(found).toBe(true);
  });
});

// The note-range types. A note is a frequency and a band is a range of them, so these only work
// when the series says where its bands sit - which is why the analyser now records that.
describe("VU Meter note-range types", () => {
  // Four bands spanning 100Hz-1600Hz on a log-ish layout: the third covers 400-800Hz, which holds
  // C5 (523Hz).
  const EDGES = [100, 200, 400, 800, 1600];

  function renderNotes(type: VuMeterParams["type"], bands: number[], over: Partial<VuMeterParams> = {}, w = 8, h = 8): RenderBuffer {
    const buf = new RenderBuffer(w, h);
    renderVuMeter(buf, PALETTE, { ...BASE, type, bars: 1, ...over }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      audio: frame(1, bands),
      audioBandEdgesHz: EDGES,
      clock: { atMs: 0, startMs: 0, endMs: 1000, frameMs: 50 },
    });
    return buf;
  }

  it("listens to the notes it was given and ignores the rest of the spectrum", () => {
    // C5 is 523Hz, inside band 2 (400-800Hz). Energy in band 0 alone shouldn't reach it.
    const inRange = renderNotes("Note On", [0, 0, 1, 0], { startNote: 72, endNote: 72 });
    const outOfRange = renderNotes("Note On", [1, 0, 0, 0], { startNote: 72, endNote: 72 });
    expect(inRange.getPixel(0, 0).a).toBeGreaterThan(0);
    expect(outOfRange.getPixel(0, 0).a).toBe(0);
  });

  it("renders nothing when the series doesn't say where its bands sit", () => {
    // Rather than quietly widening to the whole spectrum, which would look like it was working.
    const buf = new RenderBuffer(8, 8);
    renderVuMeter(buf, PALETTE, { ...BASE, type: "Note On" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0.5,
      seed: 1,
      audio: frame(1, [1, 1, 1, 1]),
      clock: { atMs: 0, startMs: 0, endMs: 1000, frameMs: 50 },
    });
    expect(litCount(buf)).toBe(0);
  });

  it("Note Level Pulse waits for the sensitivity to be crossed", () => {
    const quiet = renderNotes("Note Level Pulse", [0, 0, 0.2, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 });
    const loud = renderNotes("Note Level Pulse", [0, 0, 0.9, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 });
    expect(litCount(quiet)).toBe(0);
    expect(litCount(loud)).toBeGreaterThan(0);
  });

  it("Note Level Bar moves further the louder the range gets", () => {
    const soft = renderNotes("Note Level Bar", [0, 0, 0.6, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 });
    const loud = renderNotes("Note Level Bar", [0, 0, 1, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 });
    const columnOf = (buf: RenderBuffer): number => {
      for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, 0).a > 0) return x;
      return -1;
    };
    expect(columnOf(loud)).toBeGreaterThan(columnOf(soft));
  });

  it("Node Level Jump 100 fills the height and Node Level Jump follows the range", () => {
    expect(litCount(renderNotes("Node Level Jump 100", [0, 0, 0.6, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 }))).toBe(64);
    const partial = litCount(renderNotes("Node Level Jump", [0, 0, 0.6, 0], { startNote: 72, endNote: 72, sensitivityPct: 50 }));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(64);
  });

  it("Dominant Frequency Colour picks its colour from which band is loudest", () => {
    // The whole audible range, so the dominant band can be at either end of it.
    const low = renderNotes("Dominant Frequency Colour", [1, 0, 0, 0], { startNote: 24, endNote: 108 });
    const high = renderNotes("Dominant Frequency Colour", [0, 0, 0, 1], { startNote: 24, endNote: 108 });
    expect(low.getPixel(0, 0)).not.toEqual(high.getPixel(0, 0));
  });

  it("the gradient version blends where the stepped one snaps", () => {
    const stepped = renderNotes("Dominant Frequency Colour", [0, 1, 0, 0], { startNote: 24, endNote: 108 });
    const blended = renderNotes("Dominant Frequency Colour Gradient", [0, 1, 0, 0], { startNote: 24, endNote: 108 });
    expect(stepped.getPixel(0, 0)).not.toEqual(blended.getPixel(0, 0));
  });

  it("Frame Waveform draws the frame's own level as a centred band", () => {
    const quiet = render({ type: "Frame Waveform" }, frame(0.1, [0.1]), 8, 8);
    const loud = render({ type: "Frame Waveform" }, frame(1, [1]), 8, 8);
    expect(litCount(loud)).toBeGreaterThan(litCount(quiet));
  });
});

import { describe, expect, it } from "vitest";
import reference from "./fixtures/beat-this-parity.json";
import { BEAT_THIS_MELS, beatThisChunks, beatThisLogMel, beatThisLogits, beatThisPeaks } from "../src/song/beatThis";
import { beatThisTestSignal } from "./beatThisSignal";
import { analyzeSong } from "../src/songAnalysis";
import { gridFromBeats, proBeats } from "../src/song/grid";
import type { SongModel } from "../src/song/features";
import { render, triad } from "./songSynth";

// The reference: Beat This!'s own Python pipeline on the same synthetic signal
// (tools/beat-this/export_onnx.py writes this fixture).
const fixture = reference as unknown as {
  signal: { seconds: number; sampleRate: number; bpm: number };
  frames: number;
  melFrames: Record<string, number[]>;
  beatLogits: number[];
  downbeatLogits: number[];
  beats: number[];
  downbeats: number[];
};

describe("Beat This! front end", () => {
  it("matches torchaudio's log-mel spectrogram, frame for frame", () => {
    const mel = beatThisLogMel(beatThisTestSignal());
    expect(mel.frames).toBe(fixture.frames);
    let worst = 0;
    for (const [frame, expected] of Object.entries(fixture.melFrames)) {
      const got = mel.data.subarray(Number(frame) * BEAT_THIS_MELS, (Number(frame) + 1) * BEAT_THIS_MELS);
      expected.forEach((v, m) => (worst = Math.max(worst, Math.abs(got[m]! - v))));
    }
    console.log(`log-mel max abs difference from torchaudio: ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(5e-4);
  });

  it("splits a piece into chunks the way inference.py does", () => {
    // Short piece: one chunk with a 6-frame border either side.
    expect(beatThisChunks(1000)).toEqual([{ start: -6, from: 0, to: 1000, padLeft: 6, padRight: 6 }]);
    // Long piece: 1488-frame hops, and the last chunk moved back to end on the piece.
    const chunks = beatThisChunks(4000);
    expect(chunks.map((c) => c.start)).toEqual([-6, 1482, 2506]);
    expect(chunks.at(-1)).toEqual({ start: 2506, from: 2506, to: 4000, padLeft: 0, padRight: 6 });
  });

  it("aggregates chunk outputs with earlier chunks winning the overlap", async () => {
    const frames = 4000;
    const spect = { frames, data: new Float32Array(frames * BEAT_THIS_MELS) };
    let call = 0;
    const out = await beatThisLogits(spect, async (_input, length) => {
      const id = ++call;
      return { beat: new Float32Array(length).fill(id), downbeat: new Float32Array(length).fill(-id) };
    });
    expect(out.beat[0]).toBe(1);
    expect(out.beat[1487]).toBe(1);
    expect(out.beat[1488]).toBe(2);
    expect(out.beat[2970]).toBe(2); // chunk 2 keeps its overlap with chunk 3
    expect(out.beat[3999]).toBe(3);
    expect(out.downbeat[3999]).toBe(-3);
  });
});

describe("Beat This! postprocessing", () => {
  it("gives one silent frame for no audio at all", () => {
    expect(beatThisLogMel(new Float32Array(0)).frames).toBe(1);
  });

  it("turns the reference logits into exactly the reference beats and downbeats", () => {
    const { beats, downbeats } = beatThisPeaks(Float32Array.from(fixture.beatLogits), Float32Array.from(fixture.downbeatLogits));
    expect(beats.map((b) => Math.round(b * 1e4) / 1e4)).toEqual(fixture.beats);
    expect(downbeats.map((b) => Math.round(b * 1e4) / 1e4)).toEqual(fixture.downbeats);
  });

  it("merges adjacent peaks into their mean and snaps downbeats onto beats", () => {
    const beat = new Float32Array(100).fill(-5);
    beat[10] = beat[11] = 2; // a plateau: frames 10 and 11 both peak
    beat[60] = 3;
    const down = new Float32Array(100).fill(-5);
    down[58] = 1;
    expect(beatThisPeaks(beat, down)).toEqual({ beats: [10.5 / 50, 60 / 50], downbeats: [60 / 50] });
  });
});

describe("analysing a song on Beat This!'s grid", () => {
  const audio = render(22050, 120, [
    { bars: 8, chords: [triad(57), triad(53)], pad: 0.12 },
    { bars: 8, chords: [triad(60), triad(55)], pad: 0.22, groove: "full" },
    { bars: 8, chords: [triad(57), triad(53)], pad: 0.12 },
  ]);
  const beats = Array.from({ length: 96 }, (_, i) => 0.02 + i * 0.5);

  it("takes the given beats and bars, and still finds sections, energy and hits itself", () => {
    const downbeats = beats.filter((_, i) => i % 4 === 1); // a pickup beat before the first bar
    const map = analyzeSong(audio, 22050, undefined, { grid: { beats, downbeats } });
    expect(map.source).toBe("pro");
    expect(map.bpm).toBe(120);
    expect(map.beats).toEqual(beats.map((b) => Math.round(b * 10000) / 10));
    expect(map.downbeats).toEqual(downbeats.map((b) => Math.round(b * 10000) / 10));
    expect(map.beatsPerBar).toBe(4);
    expect(map.energy).toHaveLength(beats.length);
    expect(map.sections.length).toBeGreaterThan(1);
  });

  it("chooses its own bars when the tracker marks every beat a downbeat", () => {
    const map = analyzeSong(audio, 22050, undefined, { grid: { beats, downbeats: beats } });
    expect(map.source).toBe("pro");
    expect([3, 4]).toContain(map.beatsPerBar);
    expect(map.downbeats.length).toBeLessThan(beats.length / 2);
  });

  it("ignores a grid too short to trust", () => {
    expect(analyzeSong(audio, 22050, undefined, { grid: { beats: [1, 2], downbeats: [1] } }).source).toBe("browser");
  });
});

describe("Beat This!'s beats as a lighting grid", () => {
  // proBeats and gridFromBeats's own branch read only the song's audible span.
  const span = (songStart: number, songEnd: number) => ({ songStart, songEnd, duration: songEnd + 1 }) as SongModel;
  const every = (step: number, from: number, to: number) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Math.round((from + i * step) * 1000) / 1000);

  it("makes the downbeats the beats of a 3/4 tracked at 250 BPM", () => {
    const beats = every(0.24, 0, 60);
    const downbeats = beats.filter((_, i) => i % 3 === 0);
    const out = proBeats(span(0, 60.1), beats, downbeats);
    expect(out.beats.slice(0, 3)).toEqual(downbeats.slice(0, 3));
    expect(out.beats[1]! - out.beats[0]!).toBeCloseTo(0.72);
    expect(out.downbeats).toEqual([]);
  });

  it("halves a fast even bar from each downbeat, keeping the downbeats", () => {
    const beats = every(0.2, 0, 40);
    const downbeats = beats.filter((_, i) => i % 4 === 1);
    const out = proBeats(span(0.2, 40), beats, downbeats);
    expect(out.beats[1]! - out.beats[0]!).toBeCloseTo(0.4);
    expect(downbeats.every((d) => out.beats.includes(d))).toBe(true);
    expect(out.downbeats).toEqual(downbeats);
  });

  it("halves a fast grid whose every beat is marked a downbeat, and stops", () => {
    const beats = every(0.24, 0, 24);
    const out = proBeats(span(0, 24), beats, beats);
    expect(out.beats[1]! - out.beats[0]!).toBeCloseTo(0.48);
    expect(out.downbeats).toEqual([]);
  });

  it("carries the grid to the ends of the audible song at the local tempo", () => {
    const beats = every(0.5, 10, 50);
    const out = proBeats(span(2, 60), beats, []);
    expect(out.beats[0]).toBeGreaterThanOrEqual(1.95);
    expect(out.beats[0]).toBeLessThan(2.5);
    expect(out.beats[out.beats.length - 1]).toBeGreaterThanOrEqual(59.75);
    expect(out.beats[out.beats.length - 1]).toBeLessThan(60.25);
    expect(out.beats.slice(1).every((b, i) => Math.abs(b - out.beats[i]! - 0.5) < 1e-6)).toBe(true);
  });

  it("keeps the bar going before the tracker's first downbeat and after its last", () => {
    const beats = every(0.5, 0, 47.5);
    const downbeats = beats.filter((b, i) => i % 4 === 2 && b >= 10 && b <= 30);
    const grid = gridFromBeats(span(0, 48), beats, downbeats);
    expect(grid.beatsPerBar).toBe(4);
    expect(grid.downbeats).toEqual(beats.filter((_, i) => i % 4 === 2));
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { analyzeSong, beatIndexAt, sectionAt, type SongMap } from "../src/index";
import { render, triad, type Part } from "./songSynth";

function fMeasure(detected: number[], truth: number[], toleranceMs: number): number {
  const hit = (list: number[], t: number): boolean => list.some((x) => Math.abs(x - t) <= toleranceMs);
  const precision = detected.filter((d) => hit(truth, d)).length / Math.max(1, detected.length);
  const recall = truth.filter((t) => hit(detected, t)).length / Math.max(1, truth.length);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function expectValid(map: SongMap): void {
  expect(map.sections.length).toBeGreaterThan(0);
  expect(map.sections[0]!.startMs).toBe(0);
  expect(map.sections[map.sections.length - 1]!.endMs).toBe(map.durationMs);
  map.sections.forEach((s, i) => {
    expect(s.endMs).toBeGreaterThan(s.startMs);
    if (i > 0) expect(s.startMs).toBe(map.sections[i - 1]!.endMs);
    expect(s.energy).toBeGreaterThanOrEqual(0);
    expect(s.energy).toBeLessThanOrEqual(1);
  });
  expect(map.sections.map((s) => s.rank).sort((a, b) => a - b)).toEqual(map.sections.map((_, i) => i));
  expect(map.energy).toHaveLength(map.beats.length);
  for (const v of map.energy) expect(v >= 0 && v <= 1).toBe(true);
  for (let i = 1; i < map.beats.length; i++) expect(map.beats[i]).toBeGreaterThan(map.beats[i - 1]!);
  const beats = new Set(map.beats);
  for (const d of map.downbeats) expect(beats.has(d)).toBe(true);
  for (const h of map.hits) expect(h.strength >= 0 && h.strength <= 1).toBe(true);
  for (const v of [map.bpm, map.durationMs, map.beatsPerBar, map.confidence.beats, map.confidence.sections, ...map.impacts, ...map.hits.map((h) => h.ms)]) {
    expect(Number.isFinite(v)).toBe(true);
  }
  expect(map.confidence.beats >= 0 && map.confidence.beats <= 1).toBe(true);
  expect(map.confidence.sections >= 0 && map.confidence.sections <= 1).toBe(true);
  expect(JSON.parse(JSON.stringify(map))).toEqual(map);
}

describe("tempo and beat grid", () => {
  for (const [bpm, sampleRate] of [
    [120, 22050],
    [90, 44100],
    [150, 22050],
  ] as const) {
    it(`finds ${bpm} BPM and its beats in a kick track at ${sampleRate} Hz`, { timeout: 60_000 }, () => {
      const bars = Math.ceil((60 * bpm) / 60 / 4) + 1;
      const audio = render(sampleRate, bpm, [{ bars, groove: "kick-hat" }]).subarray(0, sampleRate * 60);
      const map = analyzeSong(audio, sampleRate);

      expect(Math.abs(map.bpm - bpm)).toBeLessThanOrEqual(1);
      const truth: number[] = [];
      for (let t = 0; t < 60000; t += 60000 / bpm) truth.push(t);
      const f = fMeasure(map.beats, truth, 70);
      expect(f).toBeGreaterThanOrEqual(0.95);
      expect(map.confidence.beats).toBeGreaterThan(0.7);
      expectValid(map);
    });
  }

  it("rounds the tempo to a thousandth and reports progress up to done", () => {
    const steps: string[] = [];
    let lastFraction = 0;
    const audio = render(22050, 120, [{ bars: 16, groove: "kick-hat" }]);
    const map = analyzeSong(audio, 22050, (fraction, step) => {
      expect(fraction).toBeGreaterThanOrEqual(lastFraction);
      lastFraction = fraction;
      steps.push(step);
    });
    expect(map.bpm).toBe(Math.round(map.bpm * 1000) / 1000);
    expect(lastFraction).toBe(1);
    expect(steps[steps.length - 1]).toBe("Done");
  });
});

describe("sections", () => {
  const A = [triad(57, true), triad(53), triad(48), triad(55)]; // Am F C G
  const B = [triad(62), triad(64), triad(61, true), triad(66, true)]; // D E C#m F#m
  const C = [triad(58), triad(60, true), triad(63), triad(65, true)]; // Bb Cm Eb Fm
  const quiet: Part = { bars: 8, chords: A, pad: 0.12 };
  const loud: Part = { bars: 8, chords: B, pad: 0.22, groove: "full" };
  const other: Part = { bars: 8, chords: C, pad: 0.2 };

  let abacbab: SongMap;
  beforeAll(() => {
    abacbab = analyzeSong(render(22050, 120, [quiet, loud, quiet, loud, other, loud]), 22050);
  }, 60_000);

  it("puts boundaries within a bar of the true ones", () => {
    // 8 bars of 2 s each
    const truth = [16000, 32000, 48000, 64000, 80000];
    expect(abacbab.sections).toHaveLength(6);
    const found = abacbab.sections.slice(1).map((s) => s.startMs);
    found.forEach((ms, i) => expect(Math.abs(ms - truth[i]!)).toBeLessThanOrEqual(2000));
    expect(abacbab.confidence.sections).toBeGreaterThan(0.3);
  });

  it("groups the repeats and calls the loud repeated one the chorus", () => {
    const s = abacbab.sections;
    expect(s[0]!.group).toBe(s[2]!.group);
    expect(s[1]!.group).toBe(s[3]!.group);
    expect(s[1]!.group).toBe(s[5]!.group);
    expect(s[0]!.group).not.toBe(s[1]!.group);
    expect(s[4]!.group).not.toBe(s[1]!.group);
    expect(s[4]!.group).not.toBe(s[0]!.group);
    for (const i of [1, 3, 5]) expect(s[i]!.label).toBe("chorus");
    expect(s[4]!.label).toBe("bridge");
    expect(s[0]!.label).not.toBe("chorus");
  });

  it("is valid and finds the downbeats on the bar lines", () => {
    expectValid(abacbab);
    expect(abacbab.beatsPerBar).toBe(4);
    const onBar = abacbab.downbeats.filter((d) => Math.abs(d / 2000 - Math.round(d / 2000)) < 0.04);
    expect(onBar.length / abacbab.downbeats.length).toBeGreaterThan(0.95);
  });

  it("ranks the loudest section first", () => {
    const loudest = abacbab.sections.filter((s) => s.rank === 0)[0]!;
    expect(loudest.label).toBe("chorus");
  });

  it("ranks a loud middle above two quiet ends", { timeout: 60_000 }, () => {
    const map = analyzeSong(
      render(22050, 120, [
        { bars: 8, chords: A, pad: 0.08 },
        { bars: 8, chords: B, pad: 0.3, groove: "full" },
        { bars: 8, chords: A, pad: 0.08 },
      ]),
      22050,
    );
    expect(map.sections).toHaveLength(3);
    const [first, middle, last] = map.sections as [SongMap["sections"][0], SongMap["sections"][0], SongMap["sections"][0]];
    expect(middle.rank).toBe(0);
    expect(middle.energy).toBeGreaterThan(first.energy);
    expect(middle.energy).toBeGreaterThan(last.energy);
    expectValid(map);
  });

  it("counts three beats to the bar in a waltz", { timeout: 60_000 }, () => {
    const waltz = render(22050, 120, [{ bars: 32, chords: [...A, ...B].slice(0, 6), pad: 0.2, groove: "kick-hat" }], 3);
    const map = analyzeSong(waltz, 22050);
    expect(map.beatsPerBar).toBe(3);
    // 1.5 s a bar
    const onBar = map.downbeats.filter((d) => Math.abs(d / 1500 - Math.round(d / 1500)) < 0.04);
    expect(onBar.length / map.downbeats.length).toBeGreaterThan(0.95);
    expectValid(map);
  });
});

describe("lookups", () => {
  const map = { beats: [100, 600, 1100], sections: [
    { startMs: 0, endMs: 800, label: "intro", group: "A", energy: 0.2, rank: 1 },
    { startMs: 800, endMs: 1200, label: "chorus", group: "B", energy: 0.9, rank: 0 },
  ] } as unknown as SongMap;

  it("finds the last beat at or before a time", () => {
    expect(beatIndexAt(map, 50)).toBe(-1);
    expect(beatIndexAt(map, 100)).toBe(0);
    expect(beatIndexAt(map, 1099)).toBe(1);
    expect(beatIndexAt(map, 5000)).toBe(2);
  });

  it("finds the section playing at a time, clamped to the song", () => {
    expect(sectionAt(map, 0)?.label).toBe("intro");
    expect(sectionAt(map, 800)?.label).toBe("chorus");
    expect(sectionAt(map, 99999)?.label).toBe("chorus");
    expect(sectionAt({ sections: [] }, 5)).toBeUndefined();
  });
});

describe("hits and impacts", () => {
  it("finds a sudden drop and a sudden rise", { timeout: 60_000 }, () => {
    // 12 s of pad, 12 s of pad and drums, 12 s of pad: the drums arrive at 12 s and leave at 24 s
    const chords = [triad(57, true), triad(53)];
    const map = analyzeSong(
      render(22050, 120, [
        { bars: 6, chords, pad: 0.05 },
        { bars: 6, chords, pad: 0.05, groove: "full", drums: 3 },
        { bars: 6, chords, pad: 0.05 },
      ]),
      22050,
    );
    expect(map.impacts.some((t) => Math.abs(t - 12000) < 1000)).toBe(true);
    expect(map.impacts.some((t) => Math.abs(t - 24000) < 1000)).toBe(true);
    for (let i = 1; i < map.impacts.length; i++) expect(map.impacts[i]! - map.impacts[i - 1]!).toBeGreaterThanOrEqual(2000);
    const kicks = map.hits.filter((h) => h.band === "kick");
    expect(kicks.length).toBeGreaterThan(0);
    expect(kicks.every((h) => h.ms >= 11000 && h.ms <= 24500)).toBe(true);
  });

  it("finds where the band stops, and no rest in a steady groove", { timeout: 60_000 }, () => {
    const chords = [triad(57, true), triad(53)];
    const audio = render(22050, 120, [{ bars: 12, chords, pad: 0.05, groove: "full", drums: 3 }]);
    expect(analyzeSong(audio, 22050).rests).toEqual([]);
    // Bar 6 (12 s at 120 BPM) stops for two beats.
    audio.fill(0, 12 * 22050, 13 * 22050);
    const rests = analyzeSong(audio, 22050).rests;
    expect(rests.length).toBe(1);
    expect(Math.abs(rests[0]!.startMs - 12000)).toBeLessThanOrEqual(260);
    expect(Math.abs(rests[0]!.endMs - 13000)).toBeLessThanOrEqual(260);
  });
});

describe("edges", () => {
  it("returns a valid map for silence", () => {
    const map = analyzeSong(new Float32Array(22050 * 20), 22050);
    expect(map.confidence.beats).toBe(0);
    expectValid(map);
  });

  it("returns a valid map for empty audio and for a fraction of a second", () => {
    expect(() => analyzeSong(new Float32Array(0), 44100)).not.toThrow();
    const map = analyzeSong(new Float32Array(4000), 44100);
    expect(map.sections).toHaveLength(1);
    expectValid(map);
  });

  it("accepts the sample rates browsers decode at", { timeout: 60_000 }, () => {
    for (const sampleRate of [8000, 16000, 48000]) {
      const map = analyzeSong(render(sampleRate, 120, [{ bars: 12, groove: "kick-hat" }]), sampleRate);
      expect(Math.abs(map.bpm - 120)).toBeLessThanOrEqual(1);
    }
  });
});

describe("speed", () => {
  it("analyses a four minute song in under 5 seconds", { timeout: 120_000 }, () => {
    const verse = { bars: 16, chords: [triad(57, true), triad(53), triad(48), triad(55)], pad: 0.12, groove: "kick-hat" as const, drums: 0.5 };
    const chorus = { bars: 16, chords: [triad(62), triad(64), triad(61, true), triad(66, true)], pad: 0.22, groove: "full" as const };
    const bridge = { bars: 16, chords: [triad(58), triad(60, true), triad(63), triad(65, true)], pad: 0.15 };
    const audio = render(44100, 120, [{ bars: 8, chords: verse.chords, pad: 0.08 }, verse, chorus, verse, chorus, bridge, verse, chorus, { bars: 8, chords: verse.chords, pad: 0.08 }]);
    expect(audio.length / 44100).toBeGreaterThan(240);

    const started = performance.now();
    const map = analyzeSong(audio, 44100);
    const seconds = (performance.now() - started) / 1000;
    console.log(`analyzeSong: ${(audio.length / 44100).toFixed(0)} s of audio at 44100 Hz in ${seconds.toFixed(2)} s (${map.sections.length} sections, ${map.hits.length} hits, ${map.impacts.length} impacts)`);

    expect(seconds).toBeLessThan(5);
    expectValid(map);
  });
});

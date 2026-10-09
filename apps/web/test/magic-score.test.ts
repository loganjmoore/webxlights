import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzeAudio, analyzeSong, defaultParamsFor, type SongMap } from "@webxlights/engine";
import { propMap } from "../src/lib/propRoles";
import { rulesDirector } from "../src/lib/magic/director";
import { choreograph } from "../src/lib/magic/choreograph";
import { feelSpec } from "../src/lib/magic/feels";
import { magicBody } from "../src/lib/magic/apply";
import { bestCandidate, fitScore, SCORE_FLOORS, type FitScore } from "../src/lib/magic/score";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import type { Style } from "../src/lib/magic/plan";
import { syntheticSong } from "./fixtures/syntheticSong";

const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
const props = propMap(layout.models, layout.groups);
const SONGS = new URL("../../../tools/sequence-corpus/.songs/", import.meta.url);

function generateAndScore(song: SongMap, seed: number, audio?: ReturnType<typeof analyzeAudio>, style: Style = "classic"): FitScore {
  const plan = rulesDirector({ song, props, feel: "auto", seed, style });
  const placements = choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25 });
  let n = 0;
  const body = magicBody({ rows: [], timingTracks: [] }, placements, song, "replace", () => `e${n++}`).body;
  return fitScore({ song, models: layout.models, groups: layout.groups, body, placements, frameMs: 25, ...(audio ? { audio } : {}) });
}

const describeScore = (name: string, s: FitScore) =>
  `${name}: ${s.score} (loud ${s.loud.toFixed(2)} r=${s.raw.rLoud.toFixed(2)}, beat ${s.beat.toFixed(2)} x${s.raw.beatRatio.toFixed(2)}, lift ${s.lift.toFixed(2)} r=${s.raw.rLift.toFixed(2)}, style ${s.style.toFixed(2)} jsd=${s.raw.jsd.toFixed(3)}, variety ${s.variety.toFixed(2)})`;

function expectGood(s: FitScore): void {
  expect(s.score).toBeGreaterThanOrEqual(60);
  for (const [k, floor] of Object.entries(SCORE_FLOORS)) expect(s[k as keyof typeof SCORE_FLOORS], k).toBeGreaterThanOrEqual(floor);
}

/** 16-bit PCM WAV, as fetch-test-songs.mjs writes it. */
function readWav(path: URL): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(path);
  let offset = 12, sampleRate = 0, channels = 1;
  while (offset < buf.length) {
    const id = buf.toString("ascii", offset, offset + 4), size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
    } else if (id === "data") {
      const frames = size / 2 / channels;
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = buf.readInt16LE(offset + 8 + i * 2 * channels) / 32768;
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

describe("the fit score", () => {
  // Each score renders the whole house a few hundred times: about a second here, slower on CI.
  it("scores a generated sequence on a synthetic song above 60, every part above its floor", { timeout: 60_000 }, () => {
    for (const bpm of [80, 120, 150]) {
      for (const style of ["classic", "show"] as const) {
        const started = performance.now();
        const s = generateAndScore(syntheticSong(bpm), 7, undefined, style);
        console.log(`${describeScore(`synthetic ${bpm} BPM ${style}`, s)} in ${(performance.now() - started).toFixed(0)} ms`);
        expectGood(s);
      }
    }
  });

  it("tells a sequence that ignores the music from one that follows it", { timeout: 60_000 }, () => {
    const song = syntheticSong(120);
    const plan = rulesDirector({ song, props, feel: "auto", seed: 7 });
    // Everything lit, the same effect, all song long: no loud/quiet shape, nothing on the beat.
    const flat = props.filter((p) => p.key.startsWith("model:")).map((p) => ({
      elementType: "model" as const, elementId: Number(p.key.slice(6)), key: p.key, role: p.role,
      effect: { name: "Color Wash", startMs: 0, endMs: song.durationMs, params: { cycles: 1 }, palette: ["#ff0000", "#00ff00"] },
    }));
    const body = magicBody({ rows: [], timingTracks: [] }, flat, song, "replace", () => "x").body;
    const bad = fitScore({ song, models: layout.models, groups: layout.groups, body, placements: flat, frameMs: 25 });
    const good = generateAndScore(song, 7);
    console.log(describeScore("flat", bad));
    expect(bad.score).toBeLessThan(good.score - 20);
    expect(plan.sections.length).toBeGreaterThan(0);
  });
});

describe("the beat part", () => {
  it("counts a change of colour on the beat, not only a change of brightness", { timeout: 60_000 }, () => {
    const song = syntheticSong(120);
    const matrix = props.find((p) => p.role === "matrix")!;
    // Red and green are equally bright: only their colour changes on each beat.
    const onEachBeat = (colours: string[]) => song.beats.slice(0, -1).map((b, i) => ({
      elementType: "model" as const, elementId: Number(matrix.key.slice(6)), key: matrix.key, role: matrix.role,
      effect: { name: "On", startMs: b, endMs: song.beats[i + 1]!, params: defaultParamsFor("On"), palette: [colours[i % colours.length]!] },
    }));
    const score = (placements: ReturnType<typeof onEachBeat>) => fitScore({ song, models: layout.models, groups: layout.groups, body: magicBody({ rows: [], timingTracks: [] }, placements, song, "replace", () => "x").body, placements, frameMs: 25 });
    expect(score(onEachBeat(["#ff0000", "#00ff00"])).raw.beatRatio).toBeGreaterThan(2 * score(onEachBeat(["#ff0000"])).raw.beatRatio);
  });
});

const songs = ["jingle-bells", "silent-night", "carol-of-the-bells"].map((id) => ({ id, wav: new URL(`${id}.wav`, SONGS) }));
describe.skipIf(!songs.every((s) => existsSync(s.wav)))("the fit score on the public-domain test songs (tools/sequence-corpus/test-songs.md)", () => {
  for (const { id, wav } of songs) {
    it(`${id} scores at least 60 with every part above its floor, in either style`, { timeout: 240_000 }, () => {
      const { samples, sampleRate } = readWav(wav);
      const song = analyzeSong(samples, sampleRate);
      const audio = analyzeAudio(samples, sampleRate, 25);
      console.log(`${id}: ${song.bpm} BPM, ${song.sections.map((s) => `${s.label}/${s.group}/${s.energy.toFixed(2)}`).join(" ")}, ${song.rests.length} rests`);
      for (const style of ["classic", "show"] as const) {
        const scores = [1, 2, 3].map((seed) => generateAndScore(song, seed, audio, style));
        scores.forEach((s, i) => console.log(describeScore(`${id} ${style} seed ${i + 1}`, s)));
        expectGood(bestCandidate(scores, (s) => s));
      }
    });
  }
});

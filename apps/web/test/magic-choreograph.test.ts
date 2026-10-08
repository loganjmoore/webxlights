import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { propMap, type Role } from "../src/lib/propRoles";
import { completePlan, rulesDirector } from "../src/lib/magic/director";
import { choreograph, type Placement } from "../src/lib/magic/choreograph";
import { feelSpec } from "../src/lib/magic/feels";
import { ROLE_EFFECTS, TWO_D_ONLY } from "../src/lib/magic/roleEffects";
import { priors } from "../src/lib/magic/priors";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import { syntheticSong } from "./fixtures/syntheticSong";
import { metrics } from "./fixtures/magicMetrics";

const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
const props = propMap(layout.models, layout.groups);
const TEMPOS = [80, 120, 150];

function generate(bpm: number, seed = 7) {
  const song = syntheticSong(bpm);
  const plan = rulesDirector({ song, props, feel: "auto", seed });
  return { song, plan, placements: choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, title: "Jingle Bells" }) };
}
const runs = TEMPOS.map((bpm) => ({ bpm, ...generate(bpm) }));

describe("the choreographer's output is a valid sequence", () => {
  it("never overlaps two effects on one layer, and keeps every effect inside the song", () => {
    for (const { song, placements } of runs) {
      const lanes = new Map<string, Placement[]>();
      for (const p of placements) {
        expect(p.effect.startMs).toBeGreaterThanOrEqual(0);
        expect(p.effect.endMs).toBeLessThanOrEqual(song.durationMs);
        expect(p.effect.endMs).toBeGreaterThan(p.effect.startMs);
        const key = `${p.key}|${p.effect.layerIndex ?? 0}`;
        (lanes.get(key) ?? lanes.set(key, []).get(key)!).push(p);
      }
      for (const list of lanes.values()) {
        list.sort((a, b) => a.effect.startMs - b.effect.startMs);
        for (let i = 1; i < list.length; i++) expect(list[i]!.effect.startMs).toBeGreaterThanOrEqual(list[i - 1]!.effect.endMs);
      }
    }
  });

  it("starts at least 85% of effects on the beat grid (beats and half-beats; bars below 90 BPM)", () => {
    for (const { bpm, song, placements } of runs) {
      const m = metrics(song, placements);
      expect(bpm < 90 ? m.onBar : m.onGrid, `${bpm} BPM`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("is deterministic for a seed and different for another", () => {
    const again = generate(120, 7).placements;
    expect(again).toEqual(runs[1]!.placements);
    const other = generate(120, 8).placements;
    expect(other).not.toEqual(runs[1]!.placements);
  });

  it("only puts on each role the effects it allows, and never a 2D-only effect on a line", () => {
    const dims = new Map(props.map((p) => [p.key, p.dims]));
    for (const { placements } of runs) {
      for (const p of placements) {
        expect(ROLE_EFFECTS[p.role], `${p.role}: ${p.effect.name}`).toContain(p.effect.name);
        if (dims.get(p.key) === 1) expect(TWO_D_ONLY.has(p.effect.name), `${p.key}: ${p.effect.name}`).toBe(false);
      }
    }
  });
});

describe("the choreographer follows the corpus", () => {
  it("lights at least 1.5x as much of the house in the loudest section as in the quietest", () => {
    for (const { bpm, song, placements } of runs) {
      const lit = metrics(song, placements).litShare;
      const byEnergy = song.sections.map((s, i) => ({ e: s.energy, lit: lit[i]! })).sort((a, b) => a.e - b.e);
      expect(byEnergy[byEnergy.length - 1]!.lit / byEnergy[0]!.lit, `${bpm} BPM`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("keeps the heroes lit most of the song and every other role near its corpus coverage", () => {
    for (const { bpm, song, placements } of runs) {
      const { coverageByRole } = metrics(song, placements);
      const others: number[] = [];
      for (const [role, coverage] of Object.entries(coverageByRole)) {
        if (["mega_tree", "matrix", "singing_face"].includes(role)) expect(coverage, `${bpm} BPM ${role}`).toBeGreaterThanOrEqual(0.6);
        else {
          const prior = priors.roles[role]!.coverage;
          expect(coverage, `${bpm} BPM ${role}`).toBeGreaterThanOrEqual(prior.p10!);
          expect(coverage, `${bpm} BPM ${role}`).toBeLessThanOrEqual(prior.p90!);
          others.push(coverage / prior.p50);
        }
      }
      // A lit role here covers its whole section, where the corpus's flicker on and off inside
      // one: the house as a whole sits within a factor of 2.5 of the corpus's medians.
      const mean = others.reduce((a, b) => a + b, 0) / others.length;
      expect(mean, `${bpm} BPM`).toBeGreaterThan(0.5);
      expect(mean, `${bpm} BPM`).toBeLessThan(2.5);
    }
  });

  it("never gives two neighbouring sections the same look", () => {
    for (const { bpm, song, placements } of runs) {
      const looks = song.sections.map((s) => {
        const inside = placements.filter((p) => !p.effect.layerIndex && p.effect.startMs >= s.startMs && p.effect.startMs < s.endMs);
        return JSON.stringify([[...new Set(inside.map((p) => `${p.role}:${p.effect.name}`))].sort(), [...new Set(inside.flatMap((p) => (p.effect.palette ?? []) as string[]))].sort()]);
      });
      for (let i = 1; i < looks.length; i++) expect(looks[i], `${bpm} BPM, sections ${i - 1} and ${i}`).not.toBe(looks[i - 1]);
    }
  });

  it("rations whole-house moments to the corpus's p75", () => {
    for (const { bpm, song, placements } of runs) {
      expect(metrics(song, placements).bigHitsPerMinute, `${bpm} BPM`).toBeLessThanOrEqual(priors.structure.bigHitsPerMinute.p75);
    }
  });

  it("puts effects on roles in a mix no further from the corpus's than a typical real song's", () => {
    // The yardstick is the corpus's own spread: the median Jensen-Shannon divergence between one
    // song's effect-by-role mix and the whole corpus's (tools/sequence-corpus analyze.mjs).
    const threshold = priors.style.roleEffectJsd.perSong.p50;
    const scores = TEMPOS.flatMap((bpm) => [1, 2, 3, 4, 5].map((seed) => metrics(syntheticSong(bpm), generate(bpm, seed).placements).style));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`style JSD mean ${mean.toFixed(3)} (corpus between-song median ${threshold})`);
    expect(mean).toBeLessThan(threshold);
  });

  it("keeps the effect rate inside the corpus's interquartile range", () => {
    for (const { bpm, song, placements } of runs) {
      const { effectsPerMinute } = metrics(song, placements);
      expect(effectsPerMinute, `${bpm} BPM`).toBeGreaterThanOrEqual(priors.corpus.effectsPerMinute.p25);
      expect(effectsPerMinute, `${bpm} BPM`).toBeLessThanOrEqual(priors.corpus.effectsPerMinute.p75);
    }
  });
});

describe("the director", () => {
  const song = syntheticSong(120);
  const rules = rulesDirector({ song, props, feel: "auto", seed: 1 });
  const roles = [...new Set(props.map((p) => p.role))] as Role[];

  it("reuses a repeated section's look, lifts the last chorus and marks the choruses with a hit", () => {
    const choruses = rules.sections.filter((s) => song.sections[s.index]!.label === "chorus");
    expect(new Set(choruses.map((s) => s.look)).size).toBe(1);
    expect(choruses[choruses.length - 1]!.intensity).toBeGreaterThan(choruses[0]!.intensity);
    expect(choruses[0]!.wholeHouseHit).toBe(true);
    expect(rules.sections[0]!.intensity).toBeLessThan(choruses[0]!.intensity);
  });

  it("fills whatever the AI director left out, field by field", () => {
    const merged = completePlan({
      palettes: { ice: ["#00FFFF", "#ffffff", "nope"] },
      sections: [{ index: 2, palette: "ice", families: { arch: ["Fire", "SingleStrand"], spaceship: ["On"] } as never, motion: "sideways" as never }],
    }, rules, roles);
    const chorus = merged.sections[2]!;
    expect(merged.palettes.ice).toEqual(["#00ffff", "#ffffff"]);
    expect(chorus.palette).toBe("ice");
    expect(chorus.families.arch).toEqual(["SingleStrand"]);
    expect(chorus.motion).toBe(rules.sections[2]!.motion);
    expect(merged.sections[0]).toEqual(rules.sections[0]);
    expect(choreograph(song, props, merged, { feel: feelSpec("auto", song), frameMs: 25 }).length).toBeGreaterThan(0);
  });
});

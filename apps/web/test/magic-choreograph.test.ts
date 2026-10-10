import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { propMap, type Role } from "../src/lib/propRoles";
import { completePlan, rulesDirector, SHOW_QUIET, showLoud } from "../src/lib/magic/director";
import { choreograph, PUNCTUAL, type MagicShader, type Placement } from "../src/lib/magic/choreograph";
import { feelSpec } from "../src/lib/magic/feels";
import { songMotifs } from "../src/lib/magic/motifs";
import { ROLE_EFFECTS, TWO_D_ONLY } from "../src/lib/magic/roleEffects";
import { priors } from "../src/lib/magic/priors";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import type { FaceSpec, RGBA, SongMap } from "@webxlights/engine";
import { magicBody } from "../src/lib/magic/apply";
import { createHouseRenderer } from "../src/lib/fseqExport";
import { syntheticSong } from "./fixtures/syntheticSong";
import { metrics } from "./fixtures/magicMetrics";
import { encodePictureData } from "../src/lib/pictureData";

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
        // Pictures are the matrix's own; shaders come only with a library (tested below).
        if (p.effect.name === "Pictures") expect(p.role).toBe("matrix");
        else expect(ROLE_EFFECTS[p.role], `${p.role}: ${p.effect.name}`).toContain(p.effect.name);
        if (dims.get(p.key) === 1) expect(TWO_D_ONLY.has(p.effect.name), `${p.key}: ${p.effect.name}`).toBe(false);
      }
    }
  });
});

describe("the choreographer follows the corpus, lit fuller", () => {
  // Logan, 2026-10-10: most of the display lit most of the time, not all of it all of the time.
  // The corpus lights 24-52% of the props; every section here lights at least half, the loudest
  // more than the quietest, and the rise shows in brightness as well.
  it("lights most of the house in every section, the loudest more than the quietest", () => {
    for (const { bpm, song, placements } of runs) {
      const lit = metrics(song, placements).litShare;
      for (const [i, share] of lit.entries()) expect(share, `${bpm} BPM section ${i}`).toBeGreaterThanOrEqual(0.5);
      const byEnergy = song.sections.map((s, i) => ({ e: s.energy, lit: lit[i]! })).sort((a, b) => a.e - b.e);
      expect(byEnergy[byEnergy.length - 1]!.lit / byEnergy[0]!.lit, `${bpm} BPM`).toBeGreaterThanOrEqual(1.2);
    }
  });

  it("keeps the heroes lit most of the song and every other role at least as lit as the corpus", () => {
    for (const { bpm, song, placements } of runs) {
      const { coverageByRole } = metrics(song, placements);
      const others: number[] = [];
      for (const [role, coverage] of Object.entries(coverageByRole)) {
        if (["mega_tree", "matrix", "singing_face"].includes(role)) expect(coverage, `${bpm} BPM ${role}`).toBeGreaterThanOrEqual(0.6);
        else {
          const prior = priors.roles[role]!.coverage;
          expect(coverage, `${bpm} BPM ${role}`).toBeGreaterThanOrEqual(prior.p10!);
          others.push(coverage / prior.p50);
        }
      }
      // Fuller than the corpus's median song, prop for prop.
      const mean = others.reduce((a, b) => a + b, 0) / others.length;
      expect(mean, `${bpm} BPM`).toBeGreaterThan(1.2);
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

  it("puts effects on roles in a mix no further from the corpus's than a typical real song's", { timeout: 60_000 }, () => {
    // The yardstick is the corpus's own spread: the median Jensen-Shannon divergence between one
    // song's effect-by-role mix and the whole corpus's (tools/sequence-corpus analyze.mjs).
    const threshold = priors.style.roleEffectJsd.perSong.p50;
    const scores = TEMPOS.flatMap((bpm) => [1, 2, 3, 4, 5].map((seed) => metrics(syntheticSong(bpm), generate(bpm, seed).placements).style));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`style JSD mean ${mean.toFixed(3)} (corpus between-song median ${threshold})`);
    expect(mean).toBeLessThan(threshold);
  });

  it("keeps the effect rate within twice the corpus's p75", () => {
    // More of the house lit, and a dim hold between a punctual effect's beats, is more effects
    // than the corpus's median song places; twice its p75 is the ceiling.
    for (const { bpm, song, placements } of runs) {
      const { effectsPerMinute } = metrics(song, placements);
      expect(effectsPerMinute, `${bpm} BPM`).toBeGreaterThanOrEqual(priors.corpus.effectsPerMinute.p25);
      expect(effectsPerMinute, `${bpm} BPM`).toBeLessThanOrEqual(2 * priors.corpus.effectsPerMinute.p75);
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

describe("the deferred spec details", () => {
  const song = syntheticSong(120);
  const run = (layoutProps = props, seed = 7) =>
    choreograph(song, layoutProps, rulesDirector({ song, props: layoutProps, feel: "auto", seed }), { feel: feelSpec("auto", song), frameMs: 25 });

  it("sequences a sub-model that is a prop of its own, and leaves a part to its parent", () => {
    const models = layout.models.map((m) =>
      m.name === "Mega Tree" ? { ...m, sub_models: [{ name: "Topper Star", type: "ranges" as const, rows: ["1-100"] }] }
      : m.name === "Arch 1" ? { ...m, sub_models: [{ name: "Upper", type: "ranges" as const, rows: ["10-40"] }] }
      // A part whose name reads as a role (a flake's ring reads as a wreath) stays with its parent.
      : m.name === "Snowflake 1" ? { ...m, sub_models: [{ name: "Circle 1", type: "ranges" as const, rows: ["1-10"] }] }
      : m);
    const withSubs = propMap(models, layout.groups);
    const placements = run(withSubs);
    const star = placements.filter((p) => p.elementType === "submodel");
    expect(star.length).toBeGreaterThan(0);
    expect(new Set(star.map((p) => `${p.subName}:${p.role}`))).toEqual(new Set(["Topper Star:star"]));
    for (const p of star) expect(ROLE_EFFECTS.star).toContain(p.effect.name);
  });

  it("gives the heroes a low-mix texture layer in loud sections, and nobody else", () => {
    const placements = run();
    const textures = placements.filter((p) => p.effect.layerIndex === 2);
    expect(textures.length).toBeGreaterThan(0);
    for (const p of textures) {
      expect(["mega_tree", "matrix", "singing_face"]).toContain(p.role);
      expect(["Twinkle", "Shimmer"]).toContain(p.effect.name);
      expect(p.effect.mix).toBe(0.6);
      const section = song.sections.find((s) => p.effect.startMs >= s.startMs && p.effect.startMs < s.endMs)!;
      expect(section.energy).toBeGreaterThan(0.5);
    }
  });

  it("never washes the whole house: it lit every prop at once", { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 3; seed++) {
      expect(run(props, seed).some((p) => p.role === "whole_house" && !p.effect.layerIndex && !p.effect.params.hit)).toBe(false);
    }
  });
});

describe("the show style", () => {
  const showRun = (song: SongMap, seed = 7) => {
    const plan = rulesDirector({ song, props, feel: "auto", seed, style: "show" });
    return { plan, placements: choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, title: "Jingle Bells" }) };
  };
  const shows = TEMPOS.map((bpm) => ({ bpm, song: syntheticSong(bpm), ...showRun(syntheticSong(bpm)) }));
  const inSection = (s: SongMap["sections"][number]) => (p: Placement) => p.effect.startMs >= s.startMs - 1 && p.effect.startMs < s.endMs - 1;
  const heroes = ["mega_tree", "matrix", "singing_face"];

  it("is a valid sequence on the grid, with each role's own effects", () => {
    const dims = new Map(props.map((p) => [p.key, p.dims]));
    for (const { bpm, song, placements } of shows) {
      const lanes = new Map<string, Placement[]>();
      for (const p of placements) {
        expect(p.effect.startMs).toBeGreaterThanOrEqual(0);
        expect(p.effect.endMs).toBeLessThanOrEqual(song.durationMs);
        if (p.effect.name !== "Pictures") expect(ROLE_EFFECTS[p.role], `${p.role}: ${p.effect.name}`).toContain(p.effect.name);
        if (dims.get(p.key) === 1) expect(TWO_D_ONLY.has(p.effect.name)).toBe(false);
        (lanes.get(`${p.key}|${p.effect.layerIndex ?? 0}`) ?? lanes.set(`${p.key}|${p.effect.layerIndex ?? 0}`, []).get(`${p.key}|${p.effect.layerIndex ?? 0}`)!).push(p);
      }
      for (const list of lanes.values()) {
        list.sort((a, b) => a.effect.startMs - b.effect.startMs);
        for (let i = 1; i < list.length; i++) expect(list[i]!.effect.startMs).toBeGreaterThanOrEqual(list[i - 1]!.effect.endMs);
      }
      const m = metrics(song, placements);
      expect(bpm < 90 ? m.onBar : m.onGrid, `${bpm} BPM`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("plays the loud sections in one colour across the house, changing on the bar", () => {
    for (const { bpm, song, plan, placements } of shows) {
      const loud = showLoud(song, plan.sections.map((s) => s.intensity));
      expect(loud.some(Boolean)).toBe(true);
      song.sections.forEach((section, si) => {
        if (!loud[si]) return;
        const bars = song.downbeats.filter((d) => d >= section.startMs && d < section.endMs);
        const colourOfBar = bars.map((d, b) => {
          // Everything showing in the middle of the bar but the focal prop (the star) wears the
          // bar's colour: nothing holds the last bar's colour over.
          const mid = (d + (bars[b + 1] ?? section.endMs)) / 2;
          const showing = placements.filter((p) => !p.effect.layerIndex && p.role !== "star" && p.effect.name !== "Pictures" && p.effect.startMs <= mid && p.effect.endMs > mid);
          const colours = new Set(showing.flatMap((p) => p.effect.palette ?? []));
          expect(colours.size, `${bpm} BPM section ${si} bar ${b}: ${[...colours]}`).toBeLessThanOrEqual(1);
          return [...colours][0];
        }).filter((c) => c !== undefined);
        for (let b = 1; b < colourOfBar.length; b++) expect(colourOfBar[b], `${bpm} BPM section ${si} bar ${b}`).not.toBe(colourOfBar[b - 1]);
      });
    }
  });

  it("lights most of the house in quiet sections, dimmed, with no showpieces", () => {
    for (const { bpm, song, plan, placements } of shows) {
      song.sections.forEach((section, si) => {
        // The bridge between two choruses is a breakdown, tested below.
        if (plan.sections[si]!.intensity >= SHOW_QUIET || section.label === "bridge") return;
        const base = placements.filter((p) => !p.effect.layerIndex && inSection(section)(p));
        expect(new Set(base.map((p) => p.key)).size, `${bpm} BPM section ${si}`).toBeGreaterThanOrEqual(0.5 * new Set(placements.map((p) => p.key)).size);
        for (const p of base) {
          expect(["Shader", "Pictures"], `${bpm} BPM section ${si}: ${p.role}`).not.toContain(p.effect.name);
          for (const c of p.effect.palette ?? []) expect(Math.max(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))).toBeLessThanOrEqual(128);
        }
      });
    }
  });

  it("answers a breakdown on one role and its answer, the rest of the house dark", () => {
    for (const { bpm, song, placements } of shows) {
      const bridge = song.sections.find((s) => s.label === "bridge")!;
      const inside = placements.filter((p) => !p.effect.layerIndex && inSection(bridge)(p));
      const roles = new Set(inside.map((p) => p.role));
      expect(roles.size, `${bpm} BPM: ${[...roles]}`).toBeGreaterThanOrEqual(1);
      expect(roles.size).toBeLessThanOrEqual(2);
      for (const r of roles) expect(heroes).not.toContain(r);
      // Each flash a new colour.
      const call = inside.filter((p) => p.role === inside[0]!.role).sort((a, b) => a.effect.startMs - b.effect.startMs);
      const starts = [...new Set(call.map((p) => p.effect.startMs))];
      const colourAt = (t: number) => call.find((p) => p.effect.startMs === t)!.effect.palette![0];
      for (let i = 1; i < starts.length; i++) expect(colourAt(starts[i]!)).not.toBe(colourAt(starts[i - 1]!));
    }
  });

  it("goes dark on the song's rests and for the beat before a drop", () => {
    const song = syntheticSong(120);
    const beatMs = 500;
    const verse = song.sections[1]!;
    song.rests = [{ startMs: verse.startMs + 8 * beatMs, endMs: verse.startMs + 9 * beatMs }];
    const { plan, placements } = showRun(song);
    const lit = (a: number, b: number) => placements.filter((p) => !p.effect.layerIndex || p.effect.layerIndex === 2 || (p.effect.layerIndex === 1 && p.effect.endMs - p.effect.startMs <= beatMs)).filter((p) => p.effect.startMs < b && p.effect.endMs > a);
    expect(lit(song.rests[0]!.startMs, song.rests[0]!.endMs)).toEqual([]);
    const chorus = plan.sections.find((s) => s.wholeHouseHit)!;
    const drop = song.sections[chorus.index]!.startMs;
    expect(placements.some((p) => p.effect.startMs === drop && p.effect.layerIndex === 1)).toBe(true);
    expect(placements.filter((p) => p.effect.startMs < drop && p.effect.endMs > drop - beatMs)).toEqual([]);
  });

  it("paints the frame of the house solid in the loud sections", () => {
    for (const { bpm, song, plan, placements } of shows) {
      const loud = showLoud(song, plan.sections.map((s) => s.intensity));
      song.sections.forEach((section, si) => {
        if (!loud[si]) return;
        const frame = placements.filter((p) => !p.effect.layerIndex && ["outline", "window", "icicle", "flood"].includes(p.role) && inSection(section)(p));
        expect(frame.length, `${bpm} BPM section ${si}`).toBeGreaterThan(0);
        for (const p of frame) expect(p.effect.name, `${bpm} BPM section ${si} ${p.role}`).toBe("On");
      });
    }
  });

  it("flashes white on the backbeats, over the frame of the house", () => {
    const { song, placements } = shows[1]!;
    const accents = placements.filter((p) => p.effect.layerIndex === 1 && !heroes.includes(p.role) && p.effect.endMs - p.effect.startMs <= 250);
    expect(accents.length).toBeGreaterThan(0);
    for (const p of accents) {
      const beat = song.beats.findIndex((b) => Math.abs(b - p.effect.startMs) <= 1);
      const bar = song.downbeats.filter((d) => d <= p.effect.startMs + 1).length - 1;
      expect((beat - song.beats.indexOf(song.downbeats[bar]!)) % 2).toBe(1);
      expect(["#ffffff"]).toContain(p.effect.palette![0]);
    }
  });

  it("scores the same kinds of thing the corpus measures, a colour change a bar at most dearer", () => {
    for (const { bpm, song, placements } of shows) {
      // A colour a bar is an effect per lit row per bar, and most of the house is lit: up to two
      // and a half times the corpus's p75 on this 32-row layout, where the user's role groups
      // would carry it in fewer rows.
      expect(metrics(song, placements).effectsPerMinute, `${bpm} BPM`).toBeLessThanOrEqual(2.5 * priors.corpus.effectsPerMinute.p75);
      const lit = metrics(song, placements).litShare;
      const byEnergy = song.sections.map((s, i) => ({ e: s.energy, lit: lit[i]! })).sort((a, b) => a.e - b.e);
      expect(byEnergy[byEnergy.length - 1]!.lit, `${bpm} BPM`).toBeGreaterThanOrEqual(byEnergy[0]!.lit);
    }
  });

  it("keeps classic the default for a plan without a style", () => {
    const song = syntheticSong(120);
    const plan = rulesDirector({ song, props, feel: "auto", seed: 7 });
    expect(plan.style).toBe("classic");
    const unstyled = { ...plan };
    delete unstyled.style;
    expect(choreograph(song, props, unstyled, { feel: feelSpec("auto", song), frameMs: 25, title: "Jingle Bells" })).toEqual(runs[1]!.placements);
  });
});

describe("the mood style", () => {
  const moodRun = (song: SongMap, seed = 7) => {
    const plan = rulesDirector({ song, props, feel: "magical", seed, style: "mood" });
    return { plan, placements: choreograph(song, props, plan, { feel: feelSpec("magical", song), frameMs: 25, title: "Jingle Bells" }) };
  };
  const moods = TEMPOS.map((bpm) => ({ bpm, song: syntheticSong(bpm), ...moodRun(syntheticSong(bpm)) }));
  const x = new Map(props.map((p) => [p.key, p.x]));
  const showingAt = (placements: Placement[], t: number) => placements.filter((p) => !p.effect.layerIndex && p.effect.name !== "Pictures" && p.effect.startMs <= t && p.effect.endMs > t);

  it("keeps one colour family all song and closes on a dim white twinkle", () => {
    let closed = 0;
    for (const { song, plan, placements } of moods) {
      expect(Object.keys(plan.palettes)).toEqual(["p0"]);
      expect(plan.sections.every((s) => s.palette === "p0")).toBe(true);
      expect(plan.ending).toBe("fade");
      // A family colour at any brightness: quiet sections glow at half.
      const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const inFamily = (c: string) => [...feelSpec("magical", song).mood, "#ffffff"].some((f) => {
        const [a, b] = [rgb(c), rgb(f)], k = Math.max(...a) / Math.max(...b);
        return a.every((v, i) => Math.abs(v - b[i]! * k) <= 2);
      });
      for (const p of placements.filter((q) => !q.effect.layerIndex && q.effect.name !== "Twinkle")) for (const c of p.effect.palette ?? []) expect(inFamily(c), `${p.role} ${c}`).toBe(true);
      const loud = showLoud(song, plan.sections.map((s) => s.intensity));
      if (loud[loud.length - 1]) continue;
      const near = showingAt(placements, song.durationMs - 300);
      expect(near.length).toBeGreaterThan(3);
      expect(near.every((p) => p.effect.name === "Twinkle" || p.effect.name === "Faces")).toBe(true);
      closed++;
    }
    expect(closed).toBeGreaterThan(0);
  });

  it("wears two colours at once in the loud sections, split down the middle of the house", () => {
    let split = 0;
    for (const { song, plan, placements } of moods) {
      // No carrier spans the middle: a group across it would paint both halves one colour.
      for (const p of placements.filter((q) => q.key.startsWith("group:"))) {
        const members = props.find((q) => q.key === p.key)!.members!.map((k) => x.get(k) ?? 0.5);
        expect(members.every((v) => v < 0.5) || members.every((v) => v >= 0.5), p.key).toBe(true);
      }
      const loud = showLoud(song, plan.sections.map((s) => s.intensity));
      song.sections.forEach((section, si) => {
        if (!loud[si]) return;
        for (const d of song.downbeats.filter((t) => t >= section.startMs && t < section.endMs - 1)) {
          const showing = showingAt(placements, d + 60000 / song.bpm / 2).filter((p) => p.role !== "star" && p.effect.name !== "Twinkle" && p.effect.name !== "Faces");
          const side = (left: boolean) => new Set(showing.filter((p) => (x.get(p.key)! < 0.5) === left && Math.abs(x.get(p.key)! - 0.5) > 0.05).flatMap((p) => p.effect.palette ?? []));
          const [l, r] = [side(true), side(false)];
          if (l.size === 1 && r.size === 1 && [...l][0] !== [...r][0]) split++;
        }
      });
    }
    expect(split).toBeGreaterThan(10);
  });

  it("passes the house between its halves where it alternates, the heroes carrying on through", () => {
    let checked = 0;
    for (const { song, plan, placements } of moods) {
      song.sections.forEach((section, si) => {
        if (plan.sections[si]!.motion !== "alternate" || plan.sections[si]!.intensity < SHOW_QUIET) return;
        for (const d of song.downbeats.filter((t) => t >= section.startMs && t < section.endMs - 1)) {
          const lit = showingAt(placements, d + 60000 / song.bpm / 2).filter((p) => !["mega_tree", "matrix", "singing_face"].includes(p.role));
          const sides = new Set(lit.map((p) => x.get(p.key)! < 0.5));
          expect(sides.size, `${section.label} at ${d}`).toBeLessThanOrEqual(1);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});


describe("pictures from the lyrics", () => {
  it("puts what a line names on the matrix while it is sung, and nothing for a line that names nothing", () => {
    const song = syntheticSong(120);
    const beatMs = 500;
    const lyrics = [
      { label: "Look at the reindeer go", startMs: 20_100, endMs: 22_400 },
      { label: "Nothing much to say here", startMs: 24_000, endMs: 26_000 },
      { label: "Grandpa drove the car home", startMs: 30_000, endMs: 31_900 },
    ];
    const plan = rulesDirector({ song, props, feel: "auto", seed: 7, style: "mood" });
    const placements = choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, lyrics });
    const matrix = props.find((p) => p.role === "matrix")!;
    const pictures = placements.filter((p) => p.key === matrix.key && typeof p.effect.params.picture === "string");
    expect(pictures.map((p) => [p.effect.params.picture, p.effect.params.movement])).toEqual([["lib:reindeer", "right"], ["lib:reindeer-car", "right"]]);
    // From the beat nearest the line's start, and nothing else on the matrix meanwhile.
    expect(Math.abs(pictures[0]!.effect.startMs - 20_000)).toBeLessThanOrEqual(beatMs / 2);
    for (const pic of pictures) {
      const meanwhile = placements.filter((p) => p.key === matrix.key && p !== pic && p.effect.startMs < pic.effect.endMs && p.effect.endMs > pic.effect.startMs && !p.effect.layerIndex);
      expect(meanwhile).toEqual([]);
    }

    // Rendered, the matrix shows the sprite and its frames take turns.
    const body = magicBody({ rows: [], timingTracks: [] }, placements, song, "replace", (() => { let n = 0; return () => `e${n++}`; })()).body;
    const house = createHouseRenderer(layout.models, body, 25, undefined, layout.groups);
    const at = (ms: number) => house.renderAt(ms)[house.models.findIndex((m) => `model:${m.id}` === matrix.key)]!;
    const frameA = at(pictures[0]!.effect.startMs + 1000), frameB = at(pictures[0]!.effect.startMs + 1080);
    expect(frameA.some((c) => c.r + c.g + c.b > 0)).toBe(true);
    expect(frameA.map((c) => `${c.r},${c.g},${c.b}`).join()).not.toBe(frameB.map((c) => `${c.r},${c.g},${c.b}`).join());
  });
});

describe("pictures the director picks", () => {
  it("shows its library drawing, or the one an image model drew, and skips a subject nobody drew", () => {
    const song = syntheticSong(120);
    const lyrics = [
      { label: "Over the hill the sleigh goes by", startMs: 20_000, endMs: 22_000 },
      { label: "A fox is watching from the snow", startMs: 26_000, endMs: 28_000 },
      { label: "The lanterns swing along the lane", startMs: 32_000, endMs: 34_000 },
    ];
    // A red square, packed the way a drawing comes back from the server.
    const red = encodePictureData(4, 4, Array.from({ length: 64 }, (_, i) => [255, 0, 0, 255][i % 4]!));
    const rules = rulesDirector({ song, props, feel: "auto", seed: 7, style: "mood" });
    const plan = { ...rules, pictures: [
      { line: 0, subject: "a sleigh over a hill", library: "sleigh" },
      { line: 1, subject: "a fox in the snow", library: "" },
      { line: 2, subject: "lanterns on a lane", library: "" },
    ] };
    const placements = choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, lyrics, drawn: new Map([["a fox in the snow", red]]) });
    const matrix = props.find((p) => p.role === "matrix")!;
    const pictures = placements.filter((p) => p.key === matrix.key && (p.effect.params.picture || p.effect.params.pictureData));
    expect(pictures.map((p) => p.effect.params.picture ?? "drawn")).toEqual(["lib:sleigh", "drawn"]);
    // A fox moves like nothing in the library, so it bounces.
    expect(pictures[1]!.effect.params.movement).toBe("bounce");

    const body = magicBody({ rows: [], timingTracks: [] }, placements, song, "replace", (() => { let n = 0; return () => `e${n++}`; })()).body;
    const house = createHouseRenderer(layout.models, body, 25, undefined, layout.groups);
    const lit = house.renderAt(pictures[1]!.effect.startMs + 600)[house.models.findIndex((m) => `model:${m.id}` === matrix.key)]!.filter((c) => c.r > 200 && c.g < 40 && c.b < 40);
    expect(lit.length).toBeGreaterThan(20);
  });

  it("keeps the director's pictures, minus a library id the browser doesn't have", () => {
    const song = syntheticSong(120);
    const rules = rulesDirector({ song, props, feel: "auto", seed: 7 });
    const plan = completePlan({ pictures: [{ line: 0, subject: "a sleigh", library: "sleigh" }, { line: 1, subject: "a lighthouse", library: "lighthouse" }] }, rules, ["matrix"]);
    expect(plan.pictures).toEqual([{ line: 0, subject: "a sleigh", library: "sleigh" }, { line: 1, subject: "a lighthouse", library: "" }]);
  });
});

describe("singing faces", () => {
  it("sing the lyric track all song on a face with a definition, the mouth on the phonemes", () => {
    const song = syntheticSong(120);
    const faceModel = layout.models.find((m) => m.name === "Singing Face")!;
    const face: FaceSpec = { name: "Face", mouths: [{ name: "AI", nodes: "46-51" }, { name: "MBP", nodes: "34-39" }], eyesOpen: "20-21" };
    const models = layout.models.map((m) => (m === faceModel ? { ...m, faces: [face] } : m));
    const key = `model:${faceModel.id}`;
    const singing = { track: "Lyrics — Phonemes", faces: new Map([[key, "Face"]]) };
    const plan = rulesDirector({ song, props, feel: "auto", seed: 7, style: "show" });
    const placements = choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, singing });

    const mine = placements.filter((p) => p.key === key && p.effect.layerIndex !== 1);
    expect(mine.map((p) => [p.effect.name, p.effect.startMs, p.effect.endMs, p.effect.params.timingTrack, p.effect.params.faceDefinition])).toEqual([["Faces", 0, song.durationMs, "Lyrics — Phonemes", "Face"]]);

    // Rendered through the app's renderer, the mouth follows the track by its name.
    const track = { name: "Lyrics — Phonemes", marks: [10000, 10500, 11000], labels: ["AI", "MBP", ""] };
    const body = magicBody({ rows: [], timingTracks: [track] }, placements, song, "replace", (() => { let n = 0; return () => `e${n++}`; })()).body;
    const house = createHouseRenderer(models, body, 25, undefined, layout.groups);
    const at = (ms: number) => house.renderAt(ms)[house.models.findIndex((m) => m.id === faceModel.id)]!;
    const lit = (nodes: RGBA[], from: number, to: number) => nodes.slice(from - 1, to).every((c) => c.a > 0 && c.r + c.g + c.b > 0);
    const dark = (nodes: RGBA[], from: number, to: number) => nodes.slice(from - 1, to).every((c) => c.a === 0 || c.r + c.g + c.b === 0);
    expect(lit(at(10200), 46, 51) && dark(at(10200), 34, 39)).toBe(true);
    const later = at(10700);
    expect(lit(later, 34, 39) && dark(later, 46, 51)).toBe(true);
  });

  it("sing on a sub-model of a prop with a face definition, the face renumbered into it", () => {
    const song = syntheticSong(120);
    const tree = layout.models.find((m) => m.name === "Mega Tree")!;
    // The face is drawn on the tree; the sub-model holds parent nodes 21-80.
    const face: FaceSpec = { name: "Tree Face", mouths: [{ name: "AI", nodes: "31-36" }, { name: "MBP", nodes: "41-46" }] };
    const models = layout.models.map((m) => (m === tree ? { ...m, faces: [face], sub_models: [{ name: "Singing Face", type: "ranges" as const, rows: ["21-80"] }] } : m));
    const withSub = propMap(models, layout.groups);
    const singing = { track: "Lyrics — Phonemes", faces: new Map([[`model:${tree.id}`, "Tree Face"]]) };
    const placements = choreograph(song, withSub, rulesDirector({ song, props: withSub, feel: "auto", seed: 7 }), { feel: feelSpec("auto", song), frameMs: 25, singing });

    const sung = placements.filter((p) => p.elementType === "submodel" && p.effect.name === "Faces");
    expect(sung.map((p) => [p.subName, p.role, p.effect.params.faceDefinition])).toEqual([["Singing Face", "singing_face", "Tree Face"]]);
    // The tree itself is a mega tree, not a face: it keeps its own effects.
    expect(placements.some((p) => p.key === `model:${tree.id}` && p.effect.name === "Faces")).toBe(false);

    // Rendered alone, the sub-model's mouth lights the tree's own mouth nodes.
    const track = { name: "Lyrics — Phonemes", marks: [10000, 10500, 11000], labels: ["AI", "MBP", ""] };
    const body = magicBody({ rows: [], timingTracks: [track] }, sung, song, "replace", () => "f").body;
    const house = createHouseRenderer(models, body, 25, undefined, layout.groups);
    const at = (ms: number) => house.renderAt(ms)[house.models.findIndex((m) => m.id === tree.id)]!;
    const on = (nodes: RGBA[], from: number, to: number) => nodes.slice(from - 1, to).every((c) => c.a > 0 && c.r + c.g + c.b > 0);
    const off = (nodes: RGBA[], from: number, to: number) => nodes.slice(from - 1, to).every((c) => c.a === 0 || c.r + c.g + c.b === 0);
    const ai = at(10200);
    expect(on(ai, 31, 36) && off(ai, 41, 46) && off(ai, 51, 56)).toBe(true);
    const mbp = at(10700);
    expect(on(mbp, 41, 46) && off(mbp, 31, 36)).toBe(true);
  });

  it("sing each on its own when a group holds them all (Magic's own \"Singing faces\" group)", () => {
    const song = syntheticSong(120);
    const faceModel = layout.models.find((m) => m.name === "Singing Face")!;
    const second = { ...faceModel, id: 900, name: "Singing Face 2" };
    const models = [...layout.models, second];
    const groups = [...layout.groups, { id: 901, name: "Magic: Singing faces", buffer_style: "Default", members: [{ id: faceModel.id, name: faceModel.name }, { id: 900, name: second.name }], params: null }];
    const withGroup = propMap(models, groups);
    const singing = { track: "Lyrics — Phonemes", faces: new Map([[`model:${faceModel.id}`, "Face"], ["model:900", "Face"]]) };
    const placements = choreograph(song, withGroup, rulesDirector({ song, props: withGroup, feel: "auto", seed: 7 }), { feel: feelSpec("auto", song), frameMs: 25, singing });
    expect(placements.filter((p) => p.effect.name === "Faces").map((p) => p.key).sort()).toEqual([`model:${faceModel.id}`, "model:900"].sort());
  });

  it("keep their own effects without lyric timing", () => {
    const song = syntheticSong(120);
    const placements = choreograph(song, props, rulesDirector({ song, props, feel: "auto", seed: 7 }), { feel: feelSpec("auto", song), frameMs: 25 });
    expect(placements.some((p) => p.effect.name === "Faces")).toBe(false);
  });
});

describe("a plan for colour, fades, shaders and pictures", () => {
  const shaders = (JSON.parse(readFileSync(fileURLToPath(new URL("../../api/database/data/builtin-shaders.json", import.meta.url)), "utf-8")) as Omit<MagicShader, "id">[])
    .map((s, i) => ({ id: i + 1, name: s.name, source: s.source, inputs: s.inputs }));
  const withLibrary = TEMPOS.map((bpm) => {
    const song = syntheticSong(bpm);
    const plan = rulesDirector({ song, props, feel: "auto", seed: 7 });
    return { bpm, song, plan, placements: choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25, title: "Jingle Bells", shaders }) };
  });
  const sectionOf = (song: ReturnType<typeof syntheticSong>, p: Placement) => song.sections.findIndex((s) => p.effect.startMs >= s.startMs - 1 && p.effect.startMs < s.endMs - 1);

  it("dresses every prop of a role alike for a section, in the section's palette", () => {
    // Its colours at any brightness: a quiet section glows dimmer, and a hold between beats dimmer still.
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const full = (c: string) => { const v = rgb(c), k = 255 / Math.max(...v, 1); return v.map((x) => Math.round(x * k)); };
    const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]!) <= 12);
    for (const { bpm, song, plan, placements } of withLibrary) {
      for (const [si, section] of song.sections.entries()) {
        const sp = plan.sections.find((s) => s.index === si)!;
        const palette = plan.palettes[sp.palette]!;
        const byRole = new Map<string, number[][]>();
        for (const p of placements) {
          if (sectionOf(song, p) !== si || p.effect.name === "Pictures" || p.effect.name === "Off") continue;
          for (const c of p.effect.palette ?? []) expect(palette.some((q) => near(full(c), full(q))), `${bpm} BPM ${section.label} ${p.role} ${c}`).toBe(true);
          if (p.effect.layerIndex) continue;
          const leads = byRole.get(p.role) ?? byRole.set(p.role, []).get(p.role)!;
          const lead = full(String((p.effect.palette ?? [])[0]));
          if (!leads.some((l) => near(l, lead))) leads.push(lead);
        }
        // A role's lead colour is its pair: one colour held, or two swapped on the beat.
        for (const [role, leads] of byRole) expect(leads.length, `${bpm} BPM section ${si} ${role}: ${leads.join(" ")}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("gives every accent and every whole-house hit in a section one colour", () => {
    for (const { song, placements } of withLibrary) {
      for (const si of song.sections.keys()) {
        const accents = placements.filter((p) => p.effect.layerIndex === 1 && sectionOf(song, p) === si);
        expect(new Set(accents.map((p) => p.effect.palette?.[0])).size).toBeLessThanOrEqual(1);
      }
    }
  });

  it("fades only into and out of dark, never from one effect into another on a prop", () => {
    for (const { bpm, placements } of withLibrary) {
      const lanes = new Map<string, Placement[]>();
      for (const p of placements) (lanes.get(`${p.key}|${p.effect.layerIndex ?? 0}`) ?? lanes.set(`${p.key}|${p.effect.layerIndex ?? 0}`, []).get(`${p.key}|${p.effect.layerIndex ?? 0}`)!).push(p);
      for (const list of lanes.values()) {
        list.sort((a, b) => a.effect.startMs - b.effect.startMs);
        list.forEach((p, i) => {
          const msg = `${bpm} BPM ${p.key} ${p.effect.name} at ${p.effect.startMs}`;
          // Pictures dissolve in and out on purpose: the image is the event.
          if (p.effect.name === "Pictures") return;
          // A pulse breathes wherever it is; a texture fades only into and out of dark.
          if (PUNCTUAL.has(p.effect.name)) return;
          if (p.effect.transition?.outType) expect(list[i + 1]?.effect.startMs ?? Infinity, msg).toBeGreaterThan(p.effect.endMs);
          if (p.effect.transition?.inType) expect(list[i - 1]?.effect.endMs ?? -Infinity, msg).toBeLessThan(p.effect.startMs);
        });
      }
    }
  });

  it("puts library shaders on the 2D heroes in the plan's colours, with the inputs a picked shader carries", () => {
    for (const { bpm, song, placements } of withLibrary) {
      const placed = placements.filter((p) => p.effect.name === "Shader");
      expect(placed.length, `${bpm} BPM`).toBeGreaterThan(0);
      for (const p of placed) {
        expect(["mega_tree", "matrix", "whole_house"]).toContain(p.role);
        const shader = shaders.find((s) => s.id === p.effect.params.shaderId)!;
        expect(p.effect.params.source).toBe(shader.source);
        expect(p.effect.params.colorInputs).toEqual(shader.inputs.filter((i) => i.type === "color").map((i) => i.name));
        expect(p.effect.palette!.length).toBeGreaterThanOrEqual(2);
      }
      // A repeated look plays the same shader on the same prop.
      const looks = new Map<string, Set<unknown>>();
      for (const p of placed) {
        const look = withLibrary.find((r) => r.bpm === bpm)!.plan.sections.find((s) => s.index === sectionOf(song, p))!.look;
        const key = `${look}|${p.key}|${p.effect.palette!.join()}`;
        (looks.get(key) ?? looks.set(key, new Set()).get(key)!).add(p.effect.params.shaderId);
      }
      for (const ids of looks.values()) expect(ids.size).toBe(1);
    }
    expect(runs.flatMap((r) => r.placements).some((p) => p.effect.name === "Shader")).toBe(false);
  });

  it("draws pictures for the matrix and animates them", () => {
    for (const { bpm, placements } of withLibrary) {
      const pictures = placements.filter((p) => p.effect.name === "Pictures");
      expect(pictures.length, `${bpm} BPM`).toBeGreaterThan(0);
      expect(pictures.length).toBeLessThanOrEqual(8);
      for (const p of pictures) {
        const image = p.effect.params.image as { width: number; height: number; data: number[] };
        expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(64);
        expect(image.data.length).toBe(image.width * image.height * 4);
        expect(image.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
        expect(["zoom in", "wiggle", "peekaboo", "left", "right"]).toContain(p.effect.params.movement);
        // Nothing plays over a picture but a whole-house hit.
        const over = placements.filter((o) => o.key === p.key && o.effect.layerIndex && o.effect.startMs < p.effect.endMs && p.effect.startMs < o.effect.endMs);
        for (const o of over) expect(o.effect.endMs - o.effect.startMs, `${bpm} BPM ${o.effect.name}`).toBeLessThanOrEqual((2 * 60000) / bpm + 25);
      }
    }
  });

  it("picks the pictures from the title, then from the feel", () => {
    expect(songMotifs("Jingle Bells", ["tree"])[0]).toBe("bell");
    expect(songMotifs("O Holy Night", ["tree"])[0]).toBe("star");
    expect(songMotifs("Awesome God", ["note"])[0]).toBe("cross");
    expect(songMotifs("Untitled", ["tree", "ornament"])).toEqual(["tree", "ornament"]);
  });
});

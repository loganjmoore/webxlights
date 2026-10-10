import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { propMap } from "../src/lib/propRoles";
import { rulesDirector } from "../src/lib/magic/director";
import { choreograph } from "../src/lib/magic/choreograph";
import { feelSpec } from "../src/lib/magic/feels";
import { effectsIn, ruleEdit, sectionsIn } from "../src/lib/magic/edits";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import { syntheticSong } from "./fixtures/syntheticSong";

const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
const props = propMap(layout.models, layout.groups);
const song = syntheticSong(120);
// intro, verse, chorus, verse, chorus, bridge, chorus, outro
const CHORUSES = [2, 4, 6];

describe("reading an ask", () => {
  it("finds the effects it names, and not the words a house is made of", () => {
    expect(effectsIn(" strobes ")).toEqual(["Strobe"]);
    expect(effectsIn("the colour wash please")).toEqual(["Color Wash"]);
    expect(effectsIn("twinkle and lightning")).toEqual(expect.arrayContaining(["Twinkle", "Lightning"]));
    expect(effectsIn("on the tree")).toEqual([]);
  });

  it("finds the sections it points at", () => {
    expect(sectionsIn("the second chorus", song)).toEqual([4]);
    expect(sectionsIn("the last chorus", song)).toEqual([6]);
    expect(sectionsIn("verse 2", song)).toEqual([3]);
    expect(sectionsIn("the choruses", song)).toEqual(CHORUSES);
    expect(sectionsIn("the ending", song)).toEqual([7]);
    expect(sectionsIn("the fifth chorus", song)).toEqual([]);
  });
});

describe("a plain-language change to the plan", () => {
  const plan = rulesDirector({ song, props, feel: "rock", seed: 3, style: "show" });
  const place = (p: typeof plan) => choreograph(song, props, p, { feel: feelSpec("rock", song), frameMs: 25 });

  it("makes the second chorus bigger and leaves the rest alone", () => {
    const edited = ruleEdit({ ...plan, sections: plan.sections.map((s) => ({ ...s, intensity: Math.min(s.intensity, 0.7) })) }, song, "Make the second chorus bigger!")!;
    edited.sections.forEach((s, i) => expect(s.intensity, `section ${i}`).toBeCloseTo(Math.min(plan.sections[i]!.intensity, 0.7) + (i === 4 ? 0.25 : 0)));
    const calmer = ruleEdit(plan, song, "the verses calmer")!;
    expect(calmer.sections[1]!.intensity).toBeLessThan(plan.sections[1]!.intensity);
    expect(calmer.sections[3]!.intensity).toBeLessThan(plan.sections[3]!.intensity);
    expect(calmer.sections[2]).toEqual(plan.sections[2]);
  });

  it("takes an effect out of every role and every layer", () => {
    const before = place(plan);
    // The whole house's sweeps, and the effect the show leans on most.
    const counts = new Map<string, number>();
    for (const p of before) if (effectsIn(p.effect.name).length) counts.set(p.effect.name, (counts.get(p.effect.name) ?? 0) + 1);
    const common = [...counts].filter(([n]) => n !== "Morph").sort((a, b) => b[1] - a[1])[0]![0];
    for (const name of ["Morph", common]) {
      expect(before.some((p) => p.effect.name === name), name).toBe(true);
      const edited = ruleEdit(plan, song, `less ${name.toLowerCase()}`)!;
      expect(edited.avoid).toContain(name);
      for (const s of edited.sections) for (const list of Object.values(s.families)) expect(list).not.toContain(name);
      expect(place(edited).filter((p) => p.effect.name === name)).toEqual([]);
    }
    // "Fewer sweeps" means the sweeps.
    expect(ruleEdit(plan, song, "fewer sweeps")!.avoid).toEqual(["Morph"]);
    // Asks add up.
    expect(ruleEdit(ruleEdit(plan, song, "no twinkle")!, song, "without strobes")!.avoid).toEqual(["Twinkle", "Strobe"]);
  });

  it("leaves anything else to the AI director", () => {
    expect(ruleEdit(plan, song, "make it feel more magical")).toBeNull();
    expect(ruleEdit(plan, song, "bigger")).toBeNull();
  });
});

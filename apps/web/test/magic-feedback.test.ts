import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { propMap } from "../src/lib/propRoles";
import { rulesDirector } from "../src/lib/magic/director";
import { choreograph } from "../src/lib/magic/choreograph";
import { feelSpec } from "../src/lib/magic/feels";
import { magicBody } from "../src/lib/magic/apply";
import { feedbackPayload, magicRecord } from "../src/lib/magic/feedback";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import { syntheticSong } from "./fixtures/syntheticSong";
// @ts-expect-error a plain .mjs tool, no types
import { trainPicker } from "../../../tools/sequence-corpus/train-picker.mjs";


const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
const props = propMap(layout.models, layout.groups);
const song = syntheticSong(120);

describe("sharing what changed", () => {
  const plan = rulesDirector({ song, props, feel: "auto", seed: 7, style: "show" });
  const placements = choreograph(song, props, plan, { feel: feelSpec("auto", song), frameMs: 25 });
  let n = 0;
  const body = magicBody({ rows: [], timingTracks: [] }, placements, song, "replace", () => `e${n++}`).body;
  const record = magicRecord(song, placements, props, "show", "auto");

  it("has nothing to share until the user changes something", () => {
    expect(record.rows.length).toBe(new Set(placements.map((p) => p.key)).size);
    expect(feedbackPayload(record, body)).toBeNull();
  });

  it("shares seconds of each effect placed and kept, per kind of prop, without saying which prop", () => {
    const edited = structuredClone(body);
    const arches = edited.rows.find((r) => r.elementType === "group" && r.elementId === 100)!;
    // Take off the arches' main effect and add a long Twinkle of the user's own.
    const main = arches.effects.find((e) => e.name !== "Twinkle" && e.name !== "On" && !e.layerIndex)!.name;
    const removed = arches.effects.filter((e) => e.name === main);
    arches.effects = arches.effects.filter((e) => e.name !== main);
    arches.effects.push({ id: "mine", name: "Twinkle", startMs: 0, endMs: 10000, params: {} });

    const payload = feedbackPayload(record, edited)!;
    expect(payload).not.toBeNull();
    expect(payload.sections).toHaveLength(song.sections.length);
    const arch = payload.rows.find((r) => r.role === "arch")!;
    expect(arch.now[main]).toBeUndefined();
    expect(arch.placed[main]).toBe(Math.max(1, Math.round(removed.reduce((s, e) => s + e.endMs - e.startMs, 0) / 1000)));
    expect(arch.now.Twinkle).toBeGreaterThanOrEqual(10);
    for (const row of payload.rows) expect(Object.keys(row).sort()).toEqual(["now", "placed", "role", "tier"]);
  });
});

describe("the learned picker", () => {
  const shared = (wanted: number) => ({ rows: [{ role: "arch", tier: "feature", placed: { SingleStrand: 60, Twinkle: 10 }, now: { SingleStrand: wanted, Twinkle: 40 } }] });

  it("learns how much more or less of an effect people want on a kind of prop, once enough songs say so", () => {
    const model = trainPicker(Array.from({ length: 6 }, () => shared(5)));
    expect(model.trainedOn).toBe(6);
    expect(model.multipliers.arch.SingleStrand).toBeLessThan(0.5);
    expect(model.multipliers.arch.Twinkle).toBeGreaterThan(2);
    expect(trainPicker(Array.from({ length: 4 }, () => shared(5))).multipliers).toEqual({});
    // Kept as given: no opinion, no multiplier.
    expect(trainPicker(Array.from({ length: 6 }, () => ({ rows: [{ role: "arch", tier: "feature", placed: { On: 20 }, now: { On: 20 } }] }))).multipliers).toEqual({});
  });

  it("is what the director weighs effects by", async () => {
    // The director loaded with a trained model, and without one.
    const weigh = async (multipliers: Record<string, Record<string, number>>) => {
      vi.resetModules();
      vi.doMock("../src/lib/magic/picker.json", () => ({ default: { version: 1, trainedOn: 40, multipliers } }));
      const { effectWeight } = await import("../src/lib/magic/director");
      const { feelSpec: spec } = await import("../src/lib/magic/feels");
      return (name: string) => effectWeight("arch", name, spec("joyful", song), 0.5);
    };
    const [plain, trained] = [await weigh({}), await weigh({ arch: { SingleStrand: 0.05 } })];
    vi.doUnmock("../src/lib/magic/picker.json");
    // Weights are squared, so the multiplier counts twice; nothing else moves.
    expect(trained("SingleStrand")).toBeCloseTo(plain("SingleStrand") * 0.05 ** 2, 10);
    expect(trained("Twinkle")).toBe(plain("Twinkle"));
  });
});

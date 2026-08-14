import { describe, expect, it } from "vitest";
import type { ParsedXsq } from "@webxlights/formats";
import {
  applyMapping,
  autoMapping,
  donorRows,
  donorTimingTrackNames,
  mappingTargets,
  mergeMapping,
  parseMappingFile,
  serializeMapping,
  unusedDonors,
} from "../src/lib/importMapping";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";

function donorEffect(name: string, startMs: number, translated = true) {
  return { name, startMs, endMs: startMs + 500, params: { cycles: 2 }, translated };
}

const PARSED: ParsedXsq = {
  frameMs: 50,
  durationMs: 10000,
  mediaFilename: "song.mp3",
  unsupportedEffectNames: [],
  rows: [
    { name: "Vendor Arch 1", elementType: "model", effects: [donorEffect("Bars", 0), donorEffect("On", 1000)] },
    { name: "Vendor Arch 2", elementType: "model", effects: [donorEffect("On", 0)] },
    { name: "Empty Row", elementType: "model", effects: [] },
    { name: "Beats", elementType: "timing", effects: [donorEffect("t", 0), donorEffect("t", 500)] },
    { name: "Lyrics", elementType: "timing", effects: [donorEffect("t", 0)] },
  ],
} as unknown as ParsedXsq;

const MODELS = [
  { id: 1, name: "Arch 1" },
  { id: 2, name: "Roofline" },
] as ModelRecord[];
const GROUPS = [{ id: 7, name: "Vendor Arch 2" }] as ModelGroupRecord[];

describe("what there is to map", () => {
  it("lists every model and group in the layout as somewhere effects can land", () => {
    const targets = mappingTargets(MODELS, GROUPS);
    expect(targets.map((t) => t.key)).toEqual(["model:Arch 1", "model:Roofline", "group:Vendor Arch 2"]);
  });

  it("counts the effects on each donor row, empty ones included", () => {
    // "The left side of the mapping list shows how many effects each model in the donor sequence
    // contains, helping you decide which elements are worth mapping." An empty row is still shown,
    // or the list disagrees with what the donor sequence looks like when opened.
    expect(donorRows(PARSED)).toEqual([
      { name: "Vendor Arch 1", effectCount: 2 },
      { name: "Vendor Arch 2", effectCount: 1 },
      { name: "Empty Row", effectCount: 0 },
    ]);
  });

  it("lists the donor's timing tracks separately from its models", () => {
    expect(donorTimingTrackNames(PARSED)).toEqual(["Beats", "Lyrics"]);
  });
});

describe("the starting mapping", () => {
  it("matches on the name, exactly and then loosely", () => {
    const targets = mappingTargets([{ id: 1, name: "vendor arch 1" } as ModelRecord], GROUPS);
    const mapping = autoMapping(targets, donorRows(PARSED));
    // Case and spacing differ, which is the common shape of a near-match; the group matches exactly.
    expect(mapping["model:vendor arch 1"]).toBe("Vendor Arch 1");
    expect(mapping["group:Vendor Arch 2"]).toBe("Vendor Arch 2");
  });

  it("leaves a model with no plausible match unmapped rather than guessing", () => {
    // A wrong guess puts someone else's effects on the wrong prop, which is worse than a row the
    // dialog shows as empty.
    const mapping = autoMapping(mappingTargets(MODELS, []), donorRows(PARSED));
    expect(mapping["model:Roofline"]).toBeUndefined();
    expect(mapping["model:Arch 1"]).toBeUndefined();
  });

  it("reports the donor rows nothing draws from", () => {
    const mapping = { "model:Arch 1": "Vendor Arch 1" };
    // The empty row isn't reported: there was nothing on it to leave behind.
    expect(unusedDonors(donorRows(PARSED), mapping)).toEqual(["Vendor Arch 2"]);
  });
});

describe("applying a mapping", () => {
  const targets = mappingTargets(MODELS, GROUPS);

  it("puts a donor row's effects on the model it was mapped to", () => {
    const applied = applyMapping(PARSED, targets, { "model:Roofline": "Vendor Arch 1" }, []);
    expect(applied.body.rows).toHaveLength(1);
    expect(applied.body.rows[0]).toMatchObject({ elementType: "model", elementId: 2 });
    expect(applied.body.rows[0]!.effects.map((e) => e.name)).toEqual(["Bars", "On"]);
  });

  it("lets one donor row feed several models", () => {
    // "These items can still be used multiple times even when grayed out."
    const applied = applyMapping(PARSED, targets, { "model:Arch 1": "Vendor Arch 1", "model:Roofline": "Vendor Arch 1" }, []);
    expect(applied.body.rows).toHaveLength(2);
    expect(applied.body.rows.every((r) => r.effects.length === 2)).toBe(true);
  });

  it("maps onto a group as readily as a model", () => {
    const applied = applyMapping(PARSED, targets, { "group:Vendor Arch 2": "Vendor Arch 1" }, []);
    expect(applied.body.rows[0]).toMatchObject({ elementType: "group", elementId: 7 });
  });

  it("gives every effect its own id, so one donor row twice isn't two rows sharing effects", () => {
    const applied = applyMapping(PARSED, targets, { "model:Arch 1": "Vendor Arch 1", "model:Roofline": "Vendor Arch 1" }, []);
    const ids = applied.body.rows.flatMap((r) => r.effects.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("imports only the timing tracks that were ticked", () => {
    const applied = applyMapping(PARSED, targets, {}, ["Lyrics"]);
    expect(applied.body.timingTracks.map((t) => t.name)).toEqual(["Lyrics"]);
    expect(applied.body.timingTracks[0]!.marks).toEqual([0]);
  });

  it("skips a mapping that points at a row with no effects", () => {
    const applied = applyMapping(PARSED, targets, { "model:Arch 1": "Empty Row" }, []);
    expect(applied.body.rows).toEqual([]);
  });

  it("falls back to schema defaults for an effect whose params weren't translated", () => {
    const untranslated = {
      ...PARSED,
      rows: [{ name: "V", elementType: "model", effects: [donorEffect("On", 0, false)] }],
    } as unknown as ParsedXsq;
    const applied = applyMapping(untranslated, targets, { "model:Arch 1": "V" }, []);
    // Not `{}`: the renderers don't all null-guard, and an empty bag can render as NaN geometry.
    expect(applied.body.rows[0]!.effects[0]!.params).toHaveProperty("startIntensity");
  });
});

describe("saving and loading a mapping", () => {
  it("round-trips", () => {
    const mapping = { "model:Arch 1": "Vendor Arch 1" };
    const loaded = parseMappingFile(serializeMapping(mapping, ["Beats"]));
    expect(loaded).toEqual({ mapping, timingTracks: ["Beats"] });
  });

  it("returns null for a file that isn't a mapping, rather than throwing at a file picker", () => {
    expect(parseMappingFile("not json")).toBeNull();
    expect(parseMappingFile('{"something": 1}')).toBeNull();
  });

  it("adds to the current mapping or replaces it, as the manual's prompt offers", () => {
    const current = { a: "one", b: "two" };
    const loaded = { b: "TWO", c: "three" };
    expect(mergeMapping(current, loaded, "replace")).toEqual(loaded);
    // "Add Additional" keeps what is already mapped and fills in the rest.
    expect(mergeMapping(current, loaded, "add")).toEqual({ a: "one", b: "two", c: "three" });
  });
});

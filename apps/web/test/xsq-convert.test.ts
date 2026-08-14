import { describe, expect, it } from "vitest";
import { describeMapping, mapXsqToBody } from "../src/lib/xsqConvert";
import type { ParsedXsq } from "@webxlights/formats";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";

const models = [{ id: 1, name: "Mega Tree" }, { id: 2, name: "Arch 1" }] as ModelRecord[];
const groups = [{ id: 10, name: "ALL", buffer_style: "Default", members: [] }] as ModelGroupRecord[];

function parsed(over: Partial<ParsedXsq> = {}): ParsedXsq {
  return {
    frameMs: 50,
    durationMs: 10_000,
    mediaFilename: "song.mp3",
    unsupportedEffectNames: [],
    rows: [],
    ...over,
  } as ParsedXsq;
}

describe("mapping an .xsq onto a layout", () => {
  it("matches rows to models by name", () => {
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "Mega Tree", elementType: "model", effects: [{ name: "On", startMs: 0, endMs: 500, params: {}, translated: true }] }] as never }),
      models,
      groups,
    );
    expect(mapped.body.rows).toHaveLength(1);
    expect(mapped.body.rows[0]!.elementType).toBe("model");
    expect(mapped.body.rows[0]!.elementId).toBe(1);
  });

  it("falls back to a group when no model has the name", () => {
    // The .xsq writes type="model" for groups too, so a name miss has to try groups before being
    // reported unmatched - real sequences target groups constantly.
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "ALL", elementType: "model", effects: [{ name: "On", startMs: 0, endMs: 500, params: {}, translated: true }] }] as never }),
      models,
      groups,
    );
    expect(mapped.body.rows[0]!.elementType).toBe("group");
    expect(mapped.body.rows[0]!.elementId).toBe(10);
    expect(mapped.unmatchedNames).toEqual([]);
  });

  it("reports a name nothing in the layout has, rather than dropping it silently", () => {
    const mapped = mapXsqToBody(
      parsed({
        rows: [
          { name: "Nonexistent", elementType: "model", effects: [{ name: "On", startMs: 0, endMs: 500, params: {}, translated: true }] },
        ] as never,
      }),
      models,
      groups,
    );
    expect(mapped.body.rows).toEqual([]);
    expect(mapped.unmatchedNames).toEqual(["Nonexistent"]);
  });

  it("says nothing about an unmatched row that had no effects on it", () => {
    // Nothing was lost, so there is nothing to report. A vendor sequence carries plenty of empty
    // rows, and listing them as unmatched buries the ones that actually had sequencing on them.
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "Nonexistent", elementType: "model", effects: [] }] as never }),
      models,
      groups,
    );
    expect(mapped.body.rows).toEqual([]);
    expect(mapped.unmatchedNames).toEqual([]);
  });

  it("gives an untranslated effect the engine's schema defaults, not an empty bag", () => {
    // The renderers don't all null-guard every field, so `{}` could render as NaN geometry and
    // throw on export - which is what this fallback exists to prevent.
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "Mega Tree", elementType: "model", effects: [{ name: "Bars", startMs: 0, endMs: 500, params: {}, translated: false }] }] as never }),
      models,
      groups,
    );
    expect(Object.keys(mapped.body.rows[0]!.effects[0]!.params).length).toBeGreaterThan(0);
  });

  it("keeps real params when the effect was translated", () => {
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "Mega Tree", elementType: "model", effects: [{ name: "Bars", startMs: 0, endMs: 500, params: { cycles: 7 }, translated: true }] }] as never }),
      models,
      groups,
    );
    expect(mapped.body.rows[0]!.effects[0]!.params.cycles).toBe(7);
  });

  it("gives every effect its own id", () => {
    const mapped = mapXsqToBody(
      parsed({
        rows: [{ name: "Mega Tree", elementType: "model", effects: [
          { name: "On", startMs: 0, endMs: 100, params: {}, translated: true },
          { name: "On", startMs: 200, endMs: 300, params: {}, translated: true },
        ] }] as never,
      }),
      models,
      groups,
    );
    const ids = mapped.body.rows[0]!.effects.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("turns timing rows into timing tracks", () => {
    const mapped = mapXsqToBody(
      parsed({ rows: [{ name: "Beats", elementType: "timing", effects: [{ name: "", startMs: 0, endMs: 0, params: {}, translated: true }, { name: "", startMs: 500, endMs: 0, params: {}, translated: true }] }] as never }),
      models,
      groups,
    );
    expect(mapped.body.timingTracks).toEqual([{ name: "Beats", marks: [0, 500] }]);
  });
});

describe("describing what a mapping did", () => {
  it("counts the rows", () => {
    expect(describeMapping({ body: { rows: [], timingTracks: [] }, unmatchedNames: [] }, parsed())).toBe("0 rows");
  });

  it("names what didn't match and what wasn't translated", () => {
    const text = describeMapping(
      { body: { rows: [], timingTracks: [] }, unmatchedNames: ["Ghost"] },
      parsed({ unsupportedEffectNames: ["Warp"] }),
    );
    expect(text).toContain("Ghost");
    expect(text).toContain("Warp");
  });
});

import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parseSettingsString, parseXsq } from "@webxlights/formats";
import { exportSequenceToXsq, xsqSettingsString } from "../src/lib/xsqExport";
import type { ModelRecord, SequenceBody, SequenceRecord } from "../src/lib/api";

const models = [{ id: 1, name: 'Arch & "one"', type: "Arches" }] as ModelRecord[];
const body: SequenceBody = {
  timingTracks: [{ name: "Beats", marks: [0, 500, 1000, 2000], labels: ["One & two", "", "End"], fixed: true }],
  rows: [{ elementType: "model", elementId: 1, effects: [
    { id: "base", name: "On", startMs: 0, endMs: 2000, params: { startIntensity: 30, endIntensity: 80 }, palette: ["#123456"] },
    { id: "top", name: "Bars", startMs: 500, endMs: 1000, layerIndex: 2, params: { direction: "left", paletteRep: 2 } },
  ] }],
};
const sequence: SequenceRecord = {
  id: 1, name: "Export test", frame_ms: 50, duration_ms: 2000,
  audio_filename: "song & chorus.mp3", audio_path: "private/audio.mp3", body, revision: 1,
  sequence_type: "media", blend_between_models: true, metadata: { author: "Tester <QA>", comment: "é 🎄" },
};
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });

describe("editable xLights sequence export", () => {
  it("writes native fixed-point timing, escaped metadata, indexed settings and palettes", () => {
    const result = exportSequenceToXsq(models, body, sequence);
    expect(XMLValidator.validate(result.xml)).toBe(true);
    const root = parser.parse(result.xml).xsequence;
    expect(root.FixedPointTiming).toBe("1");
    expect(root.ModelBlending).toBe("true");
    expect(root.head.sequenceTiming).toBe("50 ms");
    expect(root.head.sequenceDuration).toBe(2);
    expect(root.head.author).toBe("Tester <QA>");
    expect(root.head.mediaFile).toBe("song & chorus.mp3");
    const parsed = parseXsq(result.xml);
    expect(parsed.durationMs).toBe(2000);
    expect(parsed.rows[1]!.name).toBe(models[0]!.name);
    const on = parsed.rows[1]!.effects.find((e) => e.name === "On")!;
    expect(on.params).toMatchObject({ startIntensity: 30, endIntensity: 80 });
    expect(result.xml).toContain("C_BUTTON_Palette1=#123456");
    expect(result.effectCount).toBe(2);
  });

  it("reverses layer order for xLights while retaining empty intermediate layers", () => {
    const root = parser.parse(exportSequenceToXsq(models, body, sequence).xml).xsequence;
    const layers = root.ElementEffects.Element[1].EffectLayer;
    expect(layers).toHaveLength(3);
    expect(layers[0].Effect.name).toBe("Bars");
    expect(layers[1]).toBe("");
    expect(layers[2].Effect.name).toBe("On");
  });

  it("keeps labeled and unlabeled timing cells without native fixed-interval regeneration", () => {
    const root = parser.parse(exportSequenceToXsq(models, body, sequence).xml).xsequence;
    const timing = root.ElementEffects.Element[0];
    expect(timing.fixed).toBeUndefined();
    expect(timing.EffectLayer.Effect).toEqual([
      { label: "One & two", startTime: "0", endTime: "500", protected: "1" },
      { label: "", startTime: "500", endTime: "1000", protected: "1" },
      { label: "End", startTime: "1000", endTime: "2000", protected: "1" },
    ]);
  });

  it("nests submodel and strand effects under their parent and resolves group names", () => {
    const effect = body.rows[0]!.effects[0]!;
    const nested: SequenceBody = { timingTracks: [], rows: [
      { elementType: "submodel", elementId: 1, subName: "Left", effects: [effect] },
      { elementType: "strand", elementId: 1, subName: "Strand 2", effects: [effect] },
      { elementType: "group", elementId: 9, effects: [effect] },
    ] };
    const result = exportSequenceToXsq(models, nested, sequence, [{ id: 9, name: "All arches", members: [], buffer_style: "Default" }]);
    const root = parser.parse(result.xml).xsequence;
    const parent = root.ElementEffects.Element[0];
    expect(parent.SubModelEffectLayer.name).toBe("Left");
    expect(parent.Strand.index).toBe("1");
    expect(root.ElementEffects.Element[1].name).toBe("All arches");
    expect(Array.isArray(root.EffectDB.Effect)).toBe(false); // identical settings share one DB record
    expect(result.effectCount).toBe(3);
  });

  it("uses Animation without an audio file and carries song sections as timing", () => {
    const result = exportSequenceToXsq([], { timingTracks: [], rows: [], songBoundaries: [{ ms: 0, name: "Intro" }, { ms: 1000, name: "Chorus" }] }, { ...sequence, audio_filename: null });
    const root = parser.parse(result.xml).xsequence;
    expect(root.head.sequenceType).toBe("Animation");
    expect(root.ElementEffects.Element.EffectLayer.Effect[1].label).toBe("Chorus");
    expect(result.warnings).toContain("Song sections are exported as a labeled timing track.");
  });

  it("refuses unresolved or ambiguous rows and invalid effect spans instead of losing them", () => {
    expect(() => exportSequenceToXsq([], body, sequence)).toThrow("matching model");
    expect(() => exportSequenceToXsq([{ ...models[0]!, name: "Beats" }], body, sequence)).toThrow("distinct names");
    const invalid = structuredClone(body);
    invalid.rows[0]!.effects[0]!.endMs = 3000;
    expect(() => exportSequenceToXsq(models, invalid, sequence)).toThrow("outside the sequence");
  });

  it("escapes embedded ampersands, commas and equals signs in the settings format", () => {
    const settings = { E_TEXTCTRL_Text: "a,b & c=d &comma;" };
    expect(parseSettingsString(xsqSettingsString(settings))).toEqual(settings);
  });
});

import { describe, expect, it } from "vitest";
import {
  effectFromPreset,
  groupPresets,
  parsePresetFile,
  presetFileContents,
  presetFileName,
  presetFromEffect,
  type EffectPreset,
} from "../src/lib/effectPresets";
import type { SequenceEffect } from "../src/lib/api";

const effect: SequenceEffect = {
  id: "e1",
  name: "Spirals",
  startMs: 12400,
  endMs: 14400,
  params: { paletteRep: 2, blend: true },
  palette: ["#ff0000", { kind: "colorCurve", mode: "Time", blend: "Gradient", points: [{ x: 0, color: "#00ff00" }] }],
  blendMode: "Additive",
  mix: 0.4,
  transition: { inType: "Fade", inDurationMs: 200 },
  layer: { blur: 3, renderStyle: "Single Line" },
};

describe("saving an effect as a preset", () => {
  it("keeps everything about the effect except where it is", () => {
    const preset = presetFromEffect(effect, "My Spiral", "Spirals");
    expect(preset.settings.name).toBe("Spirals");
    expect(preset.settings.params).toEqual({ paletteRep: 2, blend: true });
    expect(preset.settings.blendMode).toBe("Additive");
    expect(preset.settings.mix).toBe(0.4);
    expect(preset.settings.transition).toEqual({ inType: "Fade", inDurationMs: 200 });
    expect(preset.settings.layer).toEqual({ blur: 3, renderStyle: "Single Line" });
    expect(preset.settings.palette).toEqual(effect.palette); // colour curves included
    expect("id" in preset.settings).toBe(false);
    expect("startMs" in preset.settings).toBe(false);
  });

  it("stores how long the effect ran, not when it ran", () => {
    // A preset saved from an effect at 12.4s isn't about 12.4s - it is about what that effect
    // looked like. Keeping absolute times would make every apply subtract them back out.
    expect(presetFromEffect(effect, "My Spiral").durationMs).toBe(2000);
  });

  it("takes a deep copy, so editing the effect afterwards doesn't change the preset", () => {
    const preset = presetFromEffect(effect, "My Spiral");
    (effect.params as Record<string, unknown>).paletteRep = 99;
    expect(preset.settings.params.paletteRep).toBe(2);
    (effect.params as Record<string, unknown>).paletteRep = 2; // put it back for the other tests
  });

  it("files a preset under a default group rather than an empty one", () => {
    expect(presetFromEffect(effect, "My Spiral", "   ").group).toBe("Presets");
    expect(presetFromEffect(effect, "My Spiral").group).toBe("Presets");
  });
});

describe("applying a preset", () => {
  it("builds the effect it describes, at the moment asked for", () => {
    const preset = presetFromEffect(effect, "My Spiral");
    const applied = effectFromPreset(preset, "new-id", 5000);
    expect(applied.id).toBe("new-id");
    expect(applied.startMs).toBe(5000);
    expect(applied.endMs).toBe(7000);
    expect(applied.name).toBe("Spirals");
    expect(applied.blendMode).toBe("Additive");
  });

  it("gives each application its own copy, so editing one doesn't change the next", () => {
    const preset = presetFromEffect(effect, "My Spiral");
    const first = effectFromPreset(preset, "a", 0);
    (first.params as Record<string, unknown>).paletteRep = 42;
    expect(effectFromPreset(preset, "b", 0).params.paletteRep).toBe(2);
  });

  it("never produces a zero-length effect, which would be unselectable on the grid", () => {
    const preset: EffectPreset = { name: "Odd", group: "G", durationMs: 0, settings: presetFromEffect(effect, "x").settings };
    const applied = effectFromPreset(preset, "a", 100);
    expect(applied.endMs).toBeGreaterThan(applied.startMs);
  });
});

describe("organising presets", () => {
  it("arranges them by group, groups and presets each sorted by name", () => {
    const presets: EffectPreset[] = [
      { name: "Wide", group: "Bars", durationMs: 1, settings: { name: "Bars", params: {} } },
      { name: "Slow", group: "Spirals", durationMs: 1, settings: { name: "Spirals", params: {} } },
      { name: "Narrow", group: "Bars", durationMs: 1, settings: { name: "Bars", params: {} } },
    ];
    expect(groupPresets(presets)).toEqual([
      { group: "Bars", presets: [presets[2], presets[0]] },
      { group: "Spirals", presets: [presets[1]] },
    ]);
  });

  it("copes with no presets at all", () => {
    expect(groupPresets([])).toEqual([]);
  });
});

describe("the .xpreset file", () => {
  it("round-trips through export and import", () => {
    const preset = presetFromEffect(effect, "My Spiral", "Spirals");
    const reread = parsePresetFile(presetFileContents(preset), "My Spiral", "Spirals");
    expect(reread).toEqual(preset);
  });

  it("takes its name and group from the importer, not from the file", () => {
    // The manual's own behaviour: "a preset will be created under the highlighted group with the
    // name of the selected file". What's in the file is the configuration, not where it is filed.
    const preset = presetFromEffect(effect, "Saved As This", "Saved Group");
    const text = presetFileContents(preset);
    expect(text).not.toContain("Saved As This");
    expect(text).not.toContain("Saved Group");

    const imported = parsePresetFile(text, "Named On Import", "Group On Import")!;
    expect(imported.name).toBe("Named On Import");
    expect(imported.group).toBe("Group On Import");
  });

  it("returns null for anything that isn't a preset, rather than throwing", () => {
    // A file picker is exactly where the wrong file gets chosen, and a throw there would reach
    // the app's error overlay and take the tab down.
    expect(parsePresetFile("not json at all", "n", "g")).toBeNull();
    expect(parsePresetFile("[1,2,3]", "n", "g")).toBeNull();
    expect(parsePresetFile("{}", "n", "g")).toBeNull();
    expect(parsePresetFile('{"settings":{}}', "n", "g")).toBeNull(); // no effect name to render
    expect(parsePresetFile("null", "n", "g")).toBeNull();
  });

  it("fills in a missing params bag rather than producing an effect that can't render", () => {
    const imported = parsePresetFile('{"settings":{"name":"Bars"}}', "n", "g")!;
    expect(imported.settings.params).toEqual({});
    expect(imported.durationMs).toBeGreaterThan(0);
  });

  it("makes a filename safe on every platform, since a preset name is free text", () => {
    expect(presetFileName({ name: "Tree / Star: 2024", group: "g", durationMs: 1, settings: { name: "On", params: {} } }))
      .toBe("Tree _ Star_ 2024.xpreset");
    expect(presetFileName({ name: "///", group: "g", durationMs: 1, settings: { name: "On", params: {} } }))
      .toBe("preset.xpreset");
  });
});

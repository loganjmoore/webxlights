import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSettingsString, parseXsq, translateEffectParams } from "../src/xsq";

const fixture = readFileSync(fileURLToPath(new URL("./fixtures/sample.xsq", import.meta.url)), "utf-8");

describe("parseSettingsString", () => {
  it("splits key=value pairs and unescapes &comma; / &amp;", () => {
    const parsed = parseSettingsString("E_SLIDER_Speed=10,E_TEXTCTRL_Name=a&comma;b&amp;c");
    expect(parsed).toEqual({ E_SLIDER_Speed: "10", E_TEXTCTRL_Name: "a,b&c" });
  });

  it("returns an empty object for an empty string", () => {
    expect(parseSettingsString("")).toEqual({});
  });
});

describe("translateEffectParams", () => {
  it("translates a known effect's E_* keys into typed params", () => {
    const { params, translated } = translateEffectParams("Bars", {
      E_SLIDER_Bars_BarCount: "3",
      E_CHOICE_Bars_Direction: "H-expand",
      E_CHECKBOX_Bars_Highlight: "1",
    });
    expect(translated).toBe(true);
    expect(params.paletteRep).toBe(3);
    expect(params.direction).toBe("h-expand"); // normalized to the engine's lowercase enum
    expect(params.highlight).toBe(true);
  });

  it("reports untranslated for an effect with no param mapper (name/timing still import)", () => {
    const { translated } = translateEffectParams("Fireworks", {});
    expect(translated).toBe(false);
  });
});

describe("parseXsq (SPEC ch11 §4)", () => {
  it("parses head metadata", () => {
    const result = parseXsq(fixture);
    expect(result.frameMs).toBe(50);
    expect(result.durationMs).toBe(2000);
    expect(result.mediaFilename).toBe("test-tone.mp3");
  });

  it("resolves ref-indexed effects against EffectDB and translates known effects", () => {
    const result = parseXsq(fixture);
    const megaTree = result.rows.find((r) => r.name === "Mega Tree")!;
    expect(megaTree.effects).toHaveLength(1);
    expect(megaTree.effects[0]!.name).toBe("On");
    expect(megaTree.effects[0]!.translated).toBe(true);
    expect(megaTree.effects[0]!.params.startIntensity).toBe(100);
  });

  it("imports an effect with no param mapper as an inert placeholder (name/timing kept)", () => {
    const result = parseXsq(fixture);
    const arch = result.rows.find((r) => r.name === "Arch 1")!;
    const fire = arch.effects.find((e) => e.name === "Fire")!;
    expect(fire.translated).toBe(false);
    expect(fire.startMs).toBe(1500);
    expect(fire.endMs).toBe(2000);
    expect(result.unsupportedEffectNames).toContain("Fire");
  });

  it("drops effects named Random, per SPEC load behavior", () => {
    const result = parseXsq(fixture);
    const row = result.rows.find((r) => r.name === "Random Effect Model")!;
    expect(row.effects).toHaveLength(0);
  });

  it("parses timing rows with their marks", () => {
    const result = parseXsq(fixture);
    const timing = result.rows.find((r) => r.elementType === "timing")!;
    expect(timing.effects.map((e) => e.startMs)).toEqual([0, 500]);
    expect(timing.effects.map((e) => e.name)).toEqual(["1", "2"]);
  });

  it("throws on a non-.xsq file", () => {
    expect(() => parseXsq("<foo/>")).toThrow();
  });
});

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

describe("effect layers", () => {
  // A real xLights sequence uses layers freely, and this parser has always walked <EffectLayer>
  // elements to find the effects - then thrown the layering away. Flattening them stacks every
  // layer's effects on top of each other at the same instant, which still renders, just not as
  // anything the author wrote.
  const layered = `<?xml version="1.0" encoding="UTF-8"?>
<xsequence>
  <head><sequenceTiming>50 ms</sequenceTiming><sequenceDuration>10.0</sequenceDuration></head>
  <ElementEffects>
    <Element type="model" name="Tree">
      <EffectLayer>
        <Effect name="On" startTime="0" endTime="1000" />
      </EffectLayer>
      <EffectLayer>
        <Effect name="Bars" startTime="0" endTime="1000" />
        <Effect name="On" startTime="2000" endTime="3000" />
      </EffectLayer>
    </Element>
  </ElementEffects>
</xsequence>`;

  it("keeps which layer each effect came from", () => {
    const rows = parseXsq(layered).rows;
    const effects = rows.find((r) => r.name === "Tree")!.effects;
    expect(effects.map((e) => [e.name, e.layerIndex])).toEqual([
      ["On", 0],
      ["Bars", 1],
      ["On", 1],
    ]);
  });

  it("reads document order as bottom-to-top", () => {
    // The first <EffectLayer> is the base the rest blend onto, which is the order the engine
    // composites in - so the index can be used directly.
    const effects = parseXsq(layered).rows.find((r) => r.name === "Tree")!.effects;
    expect(effects[0]!.layerIndex).toBeLessThan(effects[1]!.layerIndex);
  });

  it("puts a single-layer sequence entirely on layer 0", () => {
    for (const row of parseXsq(fixture).rows) {
      for (const effect of row.effects) expect(effect.layerIndex).toBe(0);
    }
  });
});

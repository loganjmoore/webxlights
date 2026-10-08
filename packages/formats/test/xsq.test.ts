import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSettingsString, parseXsq } from "../src/xsq";

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

describe("parseXsq (SPEC ch11 §4)", () => {
  it("parses head metadata", () => {
    const result = parseXsq(fixture);
    expect(result.frameMs).toBe(50);
    expect(result.durationMs).toBe(2000);
    expect(result.mediaFilename).toBe("test-tone.mp3");
  });

  it("resolves ref-indexed effects against EffectDB", () => {
    const result = parseXsq(fixture);
    const megaTree = result.rows.find((r) => r.name === "Mega Tree")!;
    expect(megaTree.effects).toHaveLength(1);
    expect(megaTree.effects[0]!.name).toBe("On");
    expect(megaTree.effects[0]!.rawSettings.E_TEXTCTRL_Eff_On_Start).toBe("100");
  });

  it("keeps every effect's name and timing, whatever it is", () => {
    const result = parseXsq(fixture);
    const arch = result.rows.find((r) => r.name === "Arch 1")!;
    const fire = arch.effects.find((e) => e.name === "Fire")!;
    expect(fire.startMs).toBe(1500);
    expect(fire.endMs).toBe(2000);
  });

  it("reads each effect's palette from <ColorPalettes>", () => {
    const xml = `<xsequence><head><sequenceDuration>2</sequenceDuration></head>
      <ColorPalettes><ColorPalette>C_BUTTON_Palette1=#FF0000,C_CHECKBOX_Palette1=1</ColorPalette></ColorPalettes>
      <EffectDB><Effect>E_TEXTCTRL_Eff_On_Start=50</Effect></EffectDB>
      <ElementEffects><Element type="model" name="Tree"><EffectLayer>
        <Effect ref="0" name="On" startTime="0" endTime="500" palette="0"/>
        <Effect ref="0" name="On" startTime="500" endTime="1000"/>
      </EffectLayer></Element></ElementEffects></xsequence>`;
    const [withPalette, without] = parseXsq(xml).rows[0]!.effects;
    expect(withPalette!.rawPalette).toEqual({ C_BUTTON_Palette1: "#FF0000", C_CHECKBOX_Palette1: "1" });
    expect(without!.rawPalette).toEqual({});
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
      ["On", 1],
      ["Bars", 0],
      ["On", 0],
    ]);
  });

  it("reads document order as top-to-bottom", () => {
    // xLights writes its layer 0, the top, first; the app's layer 0 is the bottom. Reading the
    // file the other way round flipped every layered sequence on import.
    const effects = parseXsq(layered).rows.find((r) => r.name === "Tree")!.effects;
    expect(effects[0]!.layerIndex).toBeGreaterThan(effects[1]!.layerIndex);
  });

  it("puts a single-layer sequence entirely on layer 0", () => {
    for (const row of parseXsq(fixture).rows) {
      for (const effect of row.effects) expect(effect.layerIndex).toBe(0);
    }
  });
});

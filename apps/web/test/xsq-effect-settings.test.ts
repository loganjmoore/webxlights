import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE_HEX } from "@webxlights/engine";
import type { SequenceEffect } from "../src/lib/api";
import { exportEffectSettings } from "../src/lib/xsqEffectSettings";

const effect = (name: string, extra: Partial<SequenceEffect> = {}): SequenceEffect => ({ id: "test", name, startMs: 0, endMs: 1000, params: {}, ...extra });

describe("native xLights effect settings", () => {
  it("exports the actual browser defaults instead of relying on native defaults", () => {
    const result = exportEffectSettings(effect("On"));
    expect(result.settings.E_TEXTCTRL_Eff_On_Start).toBe("100");
    expect(result.settings.E_TEXTCTRL_Eff_On_End).toBe("100");
    expect(result.palette.C_BUTTON_Palette1).toBe(DEFAULT_PALETTE_HEX[0]);
    expect(result.palette.C_BUTTON_Palette2).toBe(DEFAULT_PALETTE_HEX[1]);
    expect(result.palette.C_CHECKBOX_Palette1).toBe("1");
    expect(result.warnings).toEqual([]);
  });

  it("uses native choice spelling and scales raw slider tenths", () => {
    expect(exportEffectSettings(effect("Bars", { params: { direction: "h-expand", cycles: 2.5 } })).settings).toMatchObject({
      E_CHOICE_Bars_Direction: "H-expand", E_TEXTCTRL_Bars_Cycles: "2.5",
    });
    expect(exportEffectSettings(effect("Spirals", { params: { spiralWraps: 2.5, movement: -1.5 } })).settings).toMatchObject({
      E_SLIDER_Spirals_Rotation: "25", E_TEXTCTRL_Spirals_Movement: "-1.5",
    });
  });

  it("uses stable native Wave degrees and raw Fan revolutions", () => {
    expect(exportEffectSettings(effect("Wave", { params: { numberOfWavesDeg: 900, leftToRight: true } })).settings).toMatchObject({
      E_SLIDER_Number_Waves: "900", E_CHOICE_Wave_Direction: "Left to Right",
    });
    expect(exportEffectSettings(effect("Fan", { params: { revolutionsDeg: 720 } })).settings.E_SLIDER_Fan_Revolutions).toBe("720");
  });

  it("makes boolean-to-choice effects editable in native controls", () => {
    expect(exportEffectSettings(effect("Off", { params: { transparent: true } })).settings.E_CHOICE_Off_Style).toBe("Transparent");
    expect(exportEffectSettings(effect("Butterfly", { params: { reverse: true } })).settings.E_CHOICE_Butterfly_Direction).toBe("Reverse");
  });

  it("preserves literal commas, ampersands and XML text for the writer to escape once", () => {
    const text = 'Joy, love & <light> "now"';
    expect(exportEffectSettings(effect("Text", { params: { text } })).settings.E_TEXTCTRL_Text).toBe(text);
  });

  it("reports animation loss instead of silently replacing a value curve", () => {
    const result = exportEffectSettings(effect("On", { params: { transparencyPct: { type: "Ramp", min: 20, max: 80 } } }));
    expect(result.settings.E_TEXTCTRL_On_Transparency).toBe("20");
    expect(result.warnings.join(" ")).toContain("Recreate the curve");
  });

  it("serializes native time and spatial color curves", () => {
    const result = exportEffectSettings(effect("On", { palette: [{ kind: "colorCurve", mode: "Spatial", blend: "None", direction: "Top to Bottom", points: [{ x: 1, color: "#0000ff" }, { x: 0, color: "#ff0000" }] }] }));
    expect(result.palette.C_BUTTON_Palette1).toBe("Active=TRUE|Id=ID_BUTTON_Palette1|Type=None|Timecurve=2|Values=x=0^c=#ff0000;x=1^c=#0000ff|");
    expect(result.warnings.join(" ")).toContain("spatial-color support");
  });

  it("exports fades in seconds and warns when falling back from a web-only transition", () => {
    const result = exportEffectSettings(effect("On", { transition: { inType: "Fade", inDurationMs: 1250, outType: "Ripple", outDurationMs: 500 } }));
    expect(result.settings).toMatchObject({ T_TEXTCTRL_Fadein: "1.25", T_TEXTCTRL_Fadeout: "0.5", T_CHOICE_Out_Transition_Type: "Fade" });
    expect(result.warnings.join(" ")).toContain("Ripple is replaced with Fade");
  });

  it("translates common color, buffer and canvas settings", () => {
    const result = exportEffectSettings(effect("On", {
      layerIndex: 2, blendMode: "Canvas", mix: 0.3,
      colorAdjust: { brightness: -25, sparkleColor: { r: 255, g: 0, b: 128 } },
      layer: { transform: "Flip Horizontal", subBuffer: { x1: 10, y1: 20, x2: 90, y2: 80 }, persistent: true, freezeAtFrame: 12 },
    }));
    expect(result.palette).toMatchObject({ C_SLIDER_Brightness: "75", C_COLOURPICKERCTRL_SparklesColour: "#ff0080" });
    expect(result.settings).toMatchObject({ T_CHOICE_LayerMethod: "Normal", T_CHECKBOX_Canvas: "1", T_LayersSelected: "0|1", T_SLIDER_EffectLayerMix: "30", B_CHOICE_BufferTransform: "Flip Horizontal", B_CUSTOM_SubBuffer: "10x20x90x80", B_CHECKBOX_OverlayBkg: "1", B_SPINCTRL_FreezeEffectAtFrame: "12" });
  });

  it("reports native range differences and unknown settings without mutating the source", () => {
    const original = effect("Candle", { params: { flameAgility: 20, custom: 123 } });
    const result = exportEffectSettings(original);
    expect(result.settings.E_TEXTCTRL_Candle_FlameAgility).toBe("10");
    expect(result.warnings.join(" ")).toContain("limited to 10");
    expect(result.warnings.join(" ")).toContain("custom setting is not translated");
    expect(original.params.flameAgility).toBe(20);
  });

  it("disables asset-dependent effects until their files are supplied in xLights", () => {
    for (const name of ["Pictures", "Shader"]) {
      const result = exportEffectSettings(effect(name));
      expect(result.settings.X_Effect_RenderDisabled).toBe("True");
      expect(result.warnings.join(" ")).toContain("file is selected in xLights");
    }
  });

  it("preserves Effect 1 and Effect 2 mix endpoints with a native compositing warning", () => {
    for (const blendMode of ["Effect 1", "Effect 2"] as const) {
      const result = exportEffectSettings(effect("On", { blendMode, mix: 0 }));
      expect(result.settings.T_SLIDER_EffectLayerMix).toBe("100");
      expect(result.warnings.join(" ")).toContain("native compositing");
    }
  });

  it("uses the actual native names for Snow Storm and Tendrils", () => {
    expect(exportEffectSettings(effect("Snow Storm")).name).toBe("Snowstorm");
    expect(exportEffectSettings(effect("Tendrils")).name).toBe("Tendril");
  });

  it("preserves unsupported effect locations with an explicit placeholder warning", () => {
    const result = exportEffectSettings(effect("Future Web Effect"));
    expect(result.name).toBe("Off");
    expect(result.warnings.join(" ")).toContain("Off placeholder");
  });
});

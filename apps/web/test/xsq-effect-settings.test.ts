import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE_HEX, EFFECT_SCHEMAS, defaultParamsFor } from "@webxlights/engine";
import type { SequenceEffect } from "../src/lib/api";
import { PARAMS, engineEffectName, exportEffectSettings, importEffectSettings } from "../src/lib/xsqEffectSettings";
import { priors } from "../src/lib/magic/priors";

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

describe("importing native xLights effect settings", () => {
  const normal = (v: string) => v.toLowerCase().replace(/[\s-]+/g, "");

  /** A value for every mapped param that differs from its default and survives both ranges. */
  function probeParams(name: string): SequenceEffect["params"] {
    const params: SequenceEffect["params"] = { ...defaultParamsFor(name) };
    for (const [key, mapping] of Object.entries(PARAMS[name]!)) {
      const spec = EFFECT_SCHEMAS[name]!.params.find((p) => p.key === key);
      if (!spec) continue;
      if (spec.type === "checkbox") params[key] = !spec.default;
      else if (spec.type === "choice") {
        const nativeChoices = mapping.choices ?? [];
        const usable = (spec.options ?? []).filter((o) => nativeChoices.length === 0 || nativeChoices.some((c) => normal(c) === normal(o)));
        params[key] = usable.find((o) => o !== spec.default) ?? usable[0] ?? spec.default;
      } else if (spec.type === "text") params[key] = "Joy, love & <light>";
      else {
        const scale = mapping.scale ?? 1;
        const lo = Math.max(spec.min ?? -Infinity, (mapping.min ?? -Infinity) / scale);
        const hi = Math.min(spec.max ?? Infinity, (mapping.max ?? Infinity) / scale);
        const mid = (lo + hi) / 2;
        params[key] = spec.type === "intSlider" ? Math.round(mid) : Math.round(mid * 10) / 10;
      }
    }
    return params;
  }

  it("round-trips every PARAMS entry engine -> xLights -> engine", () => {
    let checked = 0;
    for (const name of Object.keys(PARAMS)) {
      const params = probeParams(name);
      const exported = exportEffectSettings(effect(name, { params }));
      const imported = importEffectSettings(exported.name, exported.settings, exported.palette);
      expect(imported.name, name).toBe(name);
      for (const key of Object.keys(PARAMS[name]!)) {
        if (!(key in params) || exported.warnings.some((w) => w.includes(` ${key} `))) continue;
        expect(imported.params[key], `${name}.${key}`).toEqual(params[key]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("round-trips palettes, colour curves, blending, fades and layer settings", () => {
    const original = effect("Bars", {
      palette: ["#ff0000", { kind: "colorCurve", mode: "Spatial", blend: "None", direction: "Top to Bottom", points: [{ x: 0, color: "#ff0000" }, { x: 1, color: "#0000ff" }] }],
      blendMode: "Average", mix: 0.4,
      transition: { inType: "Fade", inDurationMs: 1250, inAdjust: 50, inReverse: false },
      colorAdjust: { brightness: -25, contrast: 10 },
      layer: { renderStyle: "Per Preview", transform: "Flip Horizontal", subBuffer: { x1: 10, y1: 20, x2: 90, y2: 80 }, persistent: true },
    });
    const exported = exportEffectSettings(original);
    const imported = importEffectSettings(exported.name, exported.settings, exported.palette);
    expect(imported).toMatchObject({
      palette: original.palette, blendMode: "Average", mix: 0.4, transition: original.transition,
      colorAdjust: { brightness: -25, contrast: 10 }, layer: original.layer,
    });
  });

  it("maps xLights' names for Snowstorm and Tendril back to the engine's", () => {
    expect(importEffectSettings("Snowstorm", {}).name).toBe("Snow Storm");
    expect(importEffectSettings("Tendril", {}).name).toBe("Tendrils");
  });

  it("keeps an effect the engine doesn't have, inert, rather than inventing params", () => {
    expect(importEffectSettings("Video", { E_FILEPICKERCTRL_Video_Filename: "x.mp4" })).toEqual({ name: "Video", params: {} });
  });

  it("imports the corpus presets (medians and modal choices) as the matching engine params", () => {
    // Magic Sequence starts every effect from these, so each one has to land on a real param.
    let checked = 0;
    for (const [nativeName, preset] of Object.entries(priors.parameterPresets)) {
      const name = engineEffectName(nativeName);
      const mappings = PARAMS[name];
      if (!mappings) continue;
      const settings: Record<string, string> = {};
      for (const [key, stat] of Object.entries(preset)) {
        settings[key] = stat.type === "choice" ? Object.entries(stat.shares).sort((a, b) => b[1] - a[1])[0]![0] : String(stat.p50);
      }
      const imported = importEffectSettings(nativeName, settings);
      for (const [param, mapping] of Object.entries(mappings)) {
        const raw = settings[mapping.key];
        const spec = EFFECT_SCHEMAS[name]!.params.find((p) => p.key === param);
        if (raw === undefined || !spec) continue;
        let expected: unknown;
        if (spec.type === "checkbox") expected = mapping.choices ? imported.params[param] : raw === "1";
        else if (spec.type === "choice") expected = spec.options?.find((o) => normal(o) === normal(raw)) ?? (spec.options?.length ? spec.default : raw);
        else if (spec.type === "text") expected = raw;
        else expected = Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, Number(raw) / (mapping.scale ?? 1)));
        expect(imported.params[param], `${name}.${param} from ${mapping.key}=${raw}`).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});

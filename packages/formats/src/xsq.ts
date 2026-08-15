import { XMLParser } from "fast-xml-parser";

// SPEC ch11 §4.4: "key=value" pairs joined by ",". Values escape & -> &amp; then , -> &comma;.
function unescapeSettingValue(v: string): string {
  return v.replace(/&comma;/g, ",").replace(/&amp;/g, "&");
}

export function parseSettingsString(s: string): Record<string, string> {
  if (!s) return {};
  const out: Record<string, string> = {};
  for (const pair of s.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = unescapeSettingValue(pair.slice(eq + 1));
    out[key] = value;
  }
  return out;
}

// Normalizes an xLights UI choice string ("H-expand", "Left") into the lowercase/hyphenated
// enum values this engine's effect params use ("h-expand", "left").
function normalizeChoice(v: string | undefined): string | undefined {
  return v?.toLowerCase().replace(/\s+/g, "-");
}

const num = (v: string | undefined, fallback: number): number => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined): boolean => v === "1" || v?.toLowerCase() === "true";

// SPEC ch7-8 E_* setting keys (as read directly off the source-derived tables) -> this
// engine's typed *Params shape. Effects not listed here still import with their name/time
// range intact (so they show up and are editable) but with schema-default params - a
// documented ceiling, not data loss (raw settings are preserved on the parsed effect too).
const PARAM_MAPPERS: Record<string, (s: Record<string, string>) => Record<string, unknown>> = {
  On: (s) => ({
    startIntensity: num(s.E_TEXTCTRL_Eff_On_Start, 100),
    endIntensity: num(s.E_TEXTCTRL_Eff_On_End, 100),
    transparencyPct: num(s.E_TEXTCTRL_On_Transparency, 0),
    cycles: num(s.E_TEXTCTRL_On_Cycles, 1),
    shimmer: bool(s.E_CHECKBOX_On_Shimmer),
  }),
  Bars: (s) => ({
    paletteRep: num(s.E_SLIDER_Bars_BarCount, 1),
    cycles: num(s.E_TEXTCTRL_Bars_Cycles, 1),
    direction: normalizeChoice(s.E_CHOICE_Bars_Direction) ?? "up",
    centerPercent: num(s.E_TEXTCTRL_Bars_Center, 0),
    highlight: bool(s.E_CHECKBOX_Bars_Highlight),
  }),
  "Color Wash": (s) => ({
    cycles: num(s.E_TEXTCTRL_ColorWash_Cycles, 1),
    verticalFade: bool(s.E_CHECKBOX_ColorWash_VFade),
    horizontalFade: bool(s.E_CHECKBOX_ColorWash_HFade),
    reverseFades: bool(s.E_CHECKBOX_ColorWash_ReverseFades),
    shimmer: bool(s.E_CHECKBOX_ColorWash_Shimmer),
    circularPalette: bool(s.E_CHECKBOX_ColorWash_CircularPalette),
  }),
  Twinkle: (s) => ({
    countPct: num(s.E_SLIDER_Twinkle_Count, 3),
    steps: num(s.E_SLIDER_Twinkle_Steps, 30),
  }),
  Spirals: (s) => ({
    paletteRep: num(s.E_SLIDER_Spirals_Count, 1),
    spiralWraps: num(s.E_SLIDER_Spirals_Rotation, 2),
    thicknessPct: num(s.E_SLIDER_Spirals_Thickness, 50),
    movement: num(s.E_TEXTCTRL_Spirals_Movement, 1),
    blend: bool(s.E_CHECKBOX_Spirals_Blend),
  }),
};

export function translateEffectParams(name: string, rawAttrs: Record<string, string>): { params: Record<string, unknown>; translated: boolean } {
  const mapper = PARAM_MAPPERS[name];
  if (!mapper) return { params: {}, translated: false };
  return { params: mapper(rawAttrs), translated: true };
}

export interface ParsedXsqEffect {
  name: string;
  startMs: number;
  endMs: number;
  /**
   * Which <EffectLayer> the effect came from, 0 being the first in the file.
   *
   * The file has always had these - this parser walked them to find the effects and then threw
   * the layering away, flattening every layer onto one. That was all the app could represent
   * until layers had an interface; now it is data loss, and the worst kind, because a flattened
   * import still renders *something*.
   */
  layerIndex: number;
  rawSettings: Record<string, string>;
  params: Record<string, unknown>;
  translated: boolean; // false = name/timing preserved but params are schema defaults
}

export interface ParsedXsqRow {
  elementType: "model" | "timing";
  name: string;
  effects: ParsedXsqEffect[];
}

export interface ParsedXsq {
  frameMs: number;
  durationMs: number;
  mediaFilename: string;
  rows: ParsedXsqRow[];
  unsupportedEffectNames: string[]; // distinct effect names that imported without a param mapping
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "#text" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// SPEC ch11 §4.3: an EffectLayer's <Effect> either carries settings inline as element text,
// or (the save path) a `ref` index into <EffectDB>. Both are handled.
function resolveSettingsString(effectEl: Record<string, unknown>, effectDb: string[]): string {
  if (effectEl.ref !== undefined) {
    const idx = parseInt(String(effectEl.ref), 10);
    return effectDb[idx] ?? "";
  }
  return typeof effectEl["#text"] === "string" ? effectEl["#text"] : "";
}

export function parseXsq(xml: string): ParsedXsq {
  const doc = parser.parse(xml);
  const root = doc.xsequence;
  if (!root) throw new Error("Not an .xsq sequence file: missing <xsequence> root");

  const head = root.head ?? {};
  const timingStr = String(head.sequenceTiming ?? "50 ms");
  const frameMs = parseInt(timingStr, 10) || 50;
  const durationMs = Math.round(parseFloat(String(head.sequenceDuration ?? "0")) * 1000);
  const mediaFilename = String(head.mediaFile ?? "").split(/[\\/]/).pop() ?? "";

  const effectDb = asArray<string | Record<string, unknown>>(root.EffectDB?.Effect).map((e) =>
    typeof e === "string" ? e : String((e as Record<string, unknown>)["#text"] ?? ""),
  );

  const elements = asArray<Record<string, unknown>>(root.ElementEffects?.Element);
  const rows: ParsedXsqRow[] = [];
  const unsupported = new Set<string>();

  for (const el of elements) {
    const elementType = el.type === "timing" ? "timing" : "model";
    const name = String(el.name ?? "");
    const layers = asArray<Record<string, unknown>>(el.EffectLayer as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const effects: ParsedXsqEffect[] = [];

    // Document order is bottom-to-top, which is the order this engine composites in - the first
    // <EffectLayer> is the base the rest blend onto.
    layers.forEach((layer, layerIndex) => {
      for (const effectEl of asArray<Record<string, unknown>>(layer.Effect as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        const startMs = parseInt(String(effectEl.startTime ?? "0"), 10);
        const endMs = parseInt(String(effectEl.endTime ?? "0"), 10);
        if (startMs >= endMs) continue; // SPEC: dropped on load

        if (elementType === "timing") {
          effects.push({ name: String(effectEl.label ?? ""), startMs, endMs, rawSettings: {}, params: {}, translated: true, layerIndex });
          continue;
        }

        const effectName = String(effectEl.name ?? "");
        if (effectName === "Random") continue; // SPEC: dropped on load
        const rawSettings = parseSettingsString(resolveSettingsString(effectEl, effectDb));
        const { params, translated } = translateEffectParams(effectName, rawSettings);
        if (!translated) unsupported.add(effectName);
        effects.push({ name: effectName, startMs, endMs, rawSettings, params, translated, layerIndex });
      }
    });

    rows.push({ elementType, name, effects });
  }

  return { frameMs, durationMs, mediaFilename, rows, unsupportedEffectNames: [...unsupported] };
}

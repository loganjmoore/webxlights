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

export interface ParsedXsqEffect {
  name: string;
  startMs: number;
  endMs: number;
  /**
   * The effect's layer, 0 being the bottom, as the app numbers them.
   *
   * xLights writes the top layer first, so the first <EffectLayer> in the file is the highest
   * index here. The writer reverses the same way, which is what makes import-then-export a
   * round trip instead of a flip.
   */
  layerIndex: number;
  /** The xLights settings string, unescaped. Translated to engine params by the app. */
  rawSettings: Record<string, string>;
  /** The effect's colour palette from <ColorPalettes>, unescaped; empty when it has none. */
  rawPalette: Record<string, string>;
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

  const textOf = (e: string | Record<string, unknown>) => (typeof e === "string" ? e : String(e["#text"] ?? ""));
  const effectDb = asArray<string | Record<string, unknown>>(root.EffectDB?.Effect).map(textOf);
  const palettes = asArray<string | Record<string, unknown>>(root.ColorPalettes?.ColorPalette).map(textOf);

  const elements = asArray<Record<string, unknown>>(root.ElementEffects?.Element);
  const rows: ParsedXsqRow[] = [];

  for (const el of elements) {
    const elementType = el.type === "timing" ? "timing" : "model";
    const name = String(el.name ?? "");
    const layers = asArray<Record<string, unknown>>(el.EffectLayer as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const effects: ParsedXsqEffect[] = [];

    // Document order is top-to-bottom: xLights writes its layer 0, the top, first.
    layers.forEach((layer, documentIndex) => {
      const layerIndex = layers.length - 1 - documentIndex;
      for (const effectEl of asArray<Record<string, unknown>>(layer.Effect as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        const startMs = parseInt(String(effectEl.startTime ?? "0"), 10);
        const endMs = parseInt(String(effectEl.endTime ?? "0"), 10);
        if (startMs >= endMs) continue; // SPEC: dropped on load

        if (elementType === "timing") {
          effects.push({ name: String(effectEl.label ?? ""), startMs, endMs, rawSettings: {}, rawPalette: {}, layerIndex });
          continue;
        }

        const effectName = String(effectEl.name ?? "");
        if (effectName === "Random") continue; // SPEC: dropped on load
        const rawSettings = parseSettingsString(resolveSettingsString(effectEl, effectDb));
        const rawPalette = effectEl.palette === undefined ? {} : parseSettingsString(palettes[parseInt(String(effectEl.palette), 10)] ?? "");
        effects.push({ name: effectName, startMs, endMs, rawSettings, rawPalette, layerIndex });
      }
    });

    rows.push({ elementType, name, effects });
  }

  return { frameMs, durationMs, mediaFilename, rows };
}

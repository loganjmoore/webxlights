import type { ModelGroupRecord, ModelRecord, SequenceBody, SequenceEffect, SequenceRecord } from "./api";
import { exportEffectSettings } from "./xsqEffectSettings";
import { regionsFrom } from "./songRegions";

function xml(value: string | number): string {
  if (Array.from(String(value)).some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) throw new Error("Remove invalid control characters from names and text before exporting.");
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** xLights settings escaping happens before XML escaping (UtilClasses.h::AsString). */
export function xsqSettingsString(settings: Record<string, string>): string {
  return Object.keys(settings).sort().map((key) => `${key}=${settings[key]!.replace(/&/g, "&amp;").replace(/,/g, "&comma;")}`).join(",");
}

export interface XsqExport {
  xml: string;
  warnings: string[];
  modelNames: string[];
  effectCount: number;
}

/** Editable desktop sequence. Layout geometry and audio remain separate xLights files. */
export function exportSequenceToXsq(
  models: ModelRecord[], body: SequenceBody, sequence: SequenceRecord, groups: ModelGroupRecord[] = [],
): XsqExport {
  if (!Number.isFinite(sequence.duration_ms) || sequence.duration_ms <= 0) throw new Error("Give the sequence a length before exporting it.");
  if (![20, 25, 33, 40, 50].includes(sequence.frame_ms)) throw new Error("This frame interval is not supported by the exporter.");
  const warnings = new Set<string>();
  const effectDb: string[] = [];
  const palettes: string[] = [];
  const display: string[] = [];
  const elements: string[] = [];
  const modelNames: string[] = [];
  const names = new Set<string>();
  let effectCount = 0;
  function registerName(name: string): void {
    if (!name.trim() || name !== name.trim()) throw new Error("Rename blank or invalid row names before exporting to xLights.");
    if (names.has(name)) throw new Error(`More than one row is named "${name}". Give models, groups and timing tracks distinct names before exporting.`);
    names.add(name);
  }
  function indexOf(db: string[], settings: Record<string, string>): number {
    const text = xsqSettingsString(settings);
    const existing = db.indexOf(text);
    return existing < 0 ? db.push(text) - 1 : existing;
  }
  function effectXml(effect: SequenceEffect): string {
    const { startMs, endMs } = effect;
    if (![startMs, endMs].every(Number.isFinite) || startMs < 0 || startMs >= endMs || endMs > sequence.duration_ms) {
      throw new Error(`"${effect.name}" has a time range outside the sequence. Adjust it before exporting.`);
    }
    if (startMs % sequence.frame_ms || endMs % sequence.frame_ms) warnings.add("xLights rounds effect times to the sequence's frame interval.");
    const converted = exportEffectSettings(effect);
    converted.warnings.forEach((warning) => warnings.add(warning));
    effectCount++;
    return `<Effect ref="${indexOf(effectDb, converted.settings)}" name="${xml(converted.name)}" startTime="${Math.round(startMs)}" endTime="${Math.round(endMs)}" palette="${indexOf(palettes, converted.palette)}"/>`;
  }
  function layers(effects: SequenceEffect[], tag: string, attrs = ""): string {
    const maxLayer = effects.reduce((max, e) => Math.max(max, e.layerIndex ?? 0), 0);
    if (!Number.isSafeInteger(maxLayer) || maxLayer > 1000 || effects.some((e) => !Number.isSafeInteger(e.layerIndex ?? 0) || (e.layerIndex ?? 0) < 0)) {
      throw new Error("An effect has an invalid layer number.");
    }
    // Native layer 0 is the top; pixl layer 0 is the bottom. Keep empty layers too.
    return Array.from({ length: maxLayer + 1 }, (_, nativeLayer) => {
      const content = effects.filter((e) => (e.layerIndex ?? 0) === maxLayer - nativeLayer).sort((a, b) => a.startMs - b.startMs);
      if (content.some((e, i) => i > 0 && e.startMs < content[i - 1]!.endMs)) {
        throw new Error("Two effects overlap on the same layer. Move one to another layer before exporting to xLights.");
      }
      return `<${tag}${attrs}${tag === "EffectLayer" ? "" : ` layer="${nativeLayer}"`}>${content.map(effectXml).join("")}</${tag}>`;
    }).join("\n");
  }

  for (const track of body.timingTracks) {
    registerName(track.name);
    const marks = track.marks.map((ms, i) => ({ ms, label: track.labels?.[i] ?? "" })).sort((a, b) => a.ms - b.ms);
    if (marks.some((m) => !Number.isFinite(m.ms) || m.ms < 0 || m.ms > sequence.duration_ms)) throw new Error(`Timing track "${track.name}" has marks outside the sequence.`);
    const cells = marks.slice(0, -1).map((m, i) => {
      const next = marks[i + 1]!;
      if (m.ms >= next.ms) return "";
      return `<Effect label="${xml(m.label)}" startTime="${Math.round(m.ms)}" endTime="${Math.round(next.ms)}"${track.fixed ? ' protected="1"' : ""}/>`;
    });
    display.push(`<Element type="timing" name="${xml(track.name)}" visible="1" collapsed="0" active="${display.length === 0 ? 1 : 0}" views=""/>`);
    elements.push(`<Element type="timing" name="${xml(track.name)}"><EffectLayer>${cells.join("")}</EffectLayer></Element>`);
  }
  const regions = regionsFrom(body.songBoundaries ?? [], sequence.duration_ms);
  if (regions.length) {
    let regionName = "Song sections";
    while (names.has(regionName)) regionName += " (pixl)";
    registerName(regionName);
    display.push(`<Element type="timing" name="${xml(regionName)}" visible="1" collapsed="0" active="0" views=""/>`);
    elements.push(`<Element type="timing" name="${xml(regionName)}"><EffectLayer>${regions.map((r) => `<Effect label="${xml(r.name)}" startTime="${Math.round(r.startMs)}" endTime="${Math.round(r.endMs)}"/>`).join("")}</EffectLayer></Element>`);
    warnings.add("Song sections are exported as a labeled timing track.");
  }

  const rowsByParent = new Map<string, typeof body.rows>();
  for (const row of body.rows) {
    const key = `${row.elementType === "group" ? "group" : "model"}:${row.elementId}`;
    const rows = rowsByParent.get(key) ?? [];
    rows.push(row);
    rowsByParent.set(key, rows);
  }
  for (const rows of rowsByParent.values()) {
    const first = rows[0]!;
    const parent = first.elementType === "group" ? groups.find((g) => g.id === first.elementId) : models.find((m) => m.id === first.elementId);
    if (!parent) throw new Error("A sequence row no longer has a matching model or group. Restore or remove that row before exporting.");
    registerName(parent.name);
    modelNames.push(parent.name);
    display.push(`<Element type="model" name="${xml(parent.name)}" visible="1" collapsed="0"/>`);
    const base = rows.filter((r) => r.elementType === "model" || r.elementType === "group").flatMap((r) => r.effects);
    let content = layers(base, "EffectLayer");
    const subRows = new Map<string, { tag: string; attrs: string; effects: SequenceEffect[] }>();
    for (const row of rows.filter((r) => r.elementType === "submodel" || r.elementType === "strand")) {
      if (!row.subName) throw new Error(`A submodel or strand of "${parent.name}" is missing its name.`);
      const key = `${row.elementType}:${row.subName}`;
      const isStrand = row.elementType === "strand";
      const strand = /^Strand ([1-9]\d*)$/.exec(row.subName);
      if (isStrand && !strand) throw new Error(`Cannot identify "${row.subName}" in "${parent.name}".`);
      const entry = subRows.get(key) ?? {
        tag: isStrand ? "Strand" : "SubModelEffectLayer",
        attrs: ` name="${xml(row.subName)}"${isStrand ? ` index="${Number(strand![1]) - 1}"` : ""}`,
        effects: [],
      };
      entry.effects.push(...row.effects);
      subRows.set(key, entry);
    }
    for (const entry of subRows.values()) content += layers(entry.effects, entry.tag, entry.attrs);
    elements.push(`<Element type="model" name="${xml(parent.name)}">${content}</Element>`);
  }
  const metadata = sequence.metadata ?? {};
  const header: Record<string, string> = {
    version: "2025.13", author: metadata.author ?? "", "author-email": metadata.email ?? "", "author-website": metadata.website ?? "",
    song: metadata.song ?? "", artist: metadata.artist ?? "", album: metadata.album ?? "", MusicURL: metadata.music_url ?? "", comment: metadata.comment ?? "",
    sequenceTiming: `${sequence.frame_ms} ms`, sequenceType: sequence.sequence_type === "animated" || !sequence.audio_filename ? "Animation" : "Media",
    mediaFile: sequence.audio_filename?.split(/[\\/]/).pop() ?? "", sequenceDuration: (sequence.duration_ms / 1000).toFixed(3), imageDir: "",
  };
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<xsequence BaseChannel="0" ChanCtrlBasic="0" ChanCtrlColor="0" FixedPointTiming="1" ModelBlending="${sequence.blend_between_models === true}">\n<head>${Object.entries(header).map(([key, value]) => `<${key}>${xml(value)}</${key}>`).join("")}</head>\n<ColorPalettes>${palettes.map((p) => `<ColorPalette>${xml(p)}</ColorPalette>`).join("")}</ColorPalettes>\n<EffectDB>${effectDb.map((e) => `<Effect>${xml(e)}</Effect>`).join("")}</EffectDB>\n<DisplayElements>${display.join("\n")}</DisplayElements>\n<ElementEffects>${elements.join("\n")}</ElementEffects>\n<lastView>0</lastView>\n</xsequence>\n`,
    warnings: [...warnings], modelNames, effectCount,
  };
}

export function downloadXsq(result: XsqExport, name: string): void {
  const url = URL.createObjectURL(new Blob([result.xml], { type: "application/xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9._ -]/gi, "_").replace(/\.xsq$/i, "") || "sequence"}.xsq`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

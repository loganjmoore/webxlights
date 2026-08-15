import { defaultParamsFor } from "@webxlights/engine";
import type { ParsedXsq } from "@webxlights/formats";
import { newEffectId } from "../stores/sequencer";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";

// xLights' Import Effects mapping (manual: Menus > Import).
//
// Importing a `.xsq` used to work by exact name only: a donor row called "Arch 1" landed on a
// model called "Arch 1" and anything else was reported unmatched. That is fine for a sequence
// built on your own layout and useless for the case the manual is actually about — "importing
// purchased sequences from different vendors", where none of the names are yours.
//
// So the mapping is now a thing you can see and change: every model and group in your layout gets
// a row, and you say which of the donor's rows feeds it. The names are only a starting point.
//
// What the manual's dialog has that this doesn't: the other file formats (LOR, SuperStar, Vixen,
// HLS, LSP, VSA), AI auto-mapping, Convert to Per Model, and submodel aliases. Those are named in
// docs/MANUAL-COVERAGE.md rather than half-built here.

/** A row in your layout that effects can be imported onto. */
export interface MappingTarget {
  /** Stable identity for the mapping file - a name, since ids differ between projects. */
  key: string;
  name: string;
  elementType: "model" | "group";
  elementId: number;
}

/** A row in the donor sequence that has effects to give. */
export interface DonorRow {
  name: string;
  effectCount: number;
}

/** target key -> donor row name. A donor row may feed several targets, as xLights allows. */
export type EffectMapping = Record<string, string>;

export interface AppliedMapping {
  body: SequenceBody;
  /** Targets with a donor row that actually had effects. */
  mappedCount: number;
  /** Donor rows nothing was mapped from - what the import is leaving behind. */
  unusedDonorNames: string[];
}

export function mappingTargets(models: ModelRecord[], groups: ModelGroupRecord[]): MappingTarget[] {
  return [
    ...models.map((m) => ({ key: `model:${m.name}`, name: m.name, elementType: "model" as const, elementId: m.id })),
    ...groups.map((g) => ({ key: `group:${g.name}`, name: g.name, elementType: "group" as const, elementId: g.id })),
  ];
}

/**
 * The donor's rows, with how many effects each holds.
 *
 * "The left side of the mapping list shows how many effects each model in the donor sequence
 * contains, helping you decide which elements are worth mapping." A row with no effects is still
 * listed - a sequence often carries empty rows, and hiding them would make the list disagree with
 * what someone sees when they open the donor sequence itself.
 */
export function donorRows(parsed: ParsedXsq): DonorRow[] {
  return parsed.rows
    .filter((r) => r.elementType === "model")
    .map((r) => ({ name: r.name, effectCount: r.effects.length }));
}

export function donorTimingTrackNames(parsed: ParsedXsq): string[] {
  return parsed.rows.filter((r) => r.elementType === "timing").map((r) => r.name);
}

/**
 * The starting mapping: donor rows matched to your models by name.
 *
 * Exact match first, then case- and space-insensitive, which catches "Arch 1" against "arch1"
 * without inventing matches between things that merely look similar. Nothing fuzzier than that:
 * a wrong guess here puts someone else's effects on the wrong prop, and the whole point of the
 * dialog is that you can see what it decided.
 */
export function autoMapping(targets: MappingTarget[], donors: DonorRow[]): EffectMapping {
  const exact = new Map(donors.map((d) => [d.name, d.name]));
  const loose = new Map(donors.map((d) => [normalise(d.name), d.name]));

  const mapping: EffectMapping = {};
  for (const target of targets) {
    const match = exact.get(target.name) ?? loose.get(normalise(target.name));
    if (match) mapping[target.key] = match;
  }
  return mapping;
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

/** Donor rows that no target draws from - reported so an import can say what it left behind. */
export function unusedDonors(donors: DonorRow[], mapping: EffectMapping): string[] {
  const used = new Set(Object.values(mapping));
  return donors.filter((d) => d.effectCount > 0 && !used.has(d.name)).map((d) => d.name);
}

/**
 * Builds the sequence body a mapping describes.
 *
 * Timing tracks are chosen separately from the models, as they are in xLights - they belong to the
 * sequence rather than to any row, and a phoneme track is often the thing you actually wanted from
 * a donor sequence.
 */
export function applyMapping(
  parsed: ParsedXsq,
  targets: MappingTarget[],
  mapping: EffectMapping,
  timingTrackNames: string[],
): AppliedMapping {
  const donorByName = new Map(parsed.rows.filter((r) => r.elementType === "model").map((r) => [r.name, r]));

  const rows: SequenceBody["rows"] = [];
  for (const target of targets) {
    const donorName = mapping[target.key];
    if (!donorName) continue;
    const donor = donorByName.get(donorName);
    if (!donor || donor.effects.length === 0) continue;

    rows.push({
      elementType: target.elementType,
      elementId: target.elementId,
      effects: donor.effects.map((eff) => ({
        id: newEffectId(),
        name: eff.name,
        startMs: eff.startMs,
        endMs: eff.endMs,
        // An effect whose params weren't translated gets the engine's own schema defaults rather
        // than an empty bag: the renderers don't all null-guard every field, so an untranslated
        // effect with `{}` could render as NaN geometry and throw on export.
        params: (eff.translated ? eff.params : defaultParamsFor(eff.name)) as Record<string, number | boolean | string>,
        // The donor's own layer. A real xLights sequence uses layers freely, and flattening them
        // onto one would stack every layer's effects on top of each other at the same instant -
        // which still renders, just not as anything the author wrote.
        ...(eff.layerIndex ? { layerIndex: eff.layerIndex } : {}),
      })),
    });
  }

  const wanted = new Set(timingTrackNames);
  const timingTracks = parsed.rows
    .filter((r) => r.elementType === "timing" && wanted.has(r.name))
    .map((r) => ({ name: r.name, marks: r.effects.map((e) => e.startMs) }));

  return { body: { rows, timingTracks }, mappedCount: rows.length, unusedDonorNames: unusedDonors(donorRows(parsed), mapping) };
}

/**
 * A saved mapping, for "the same layout, another sequence from the same vendor".
 *
 * xLights saves an `.xmap`; that format isn't documented in the manual and guessing at it would
 * produce files that look like xLights' and aren't. This writes its own JSON and says so in the
 * extension, which is honest about not being interchangeable.
 */
export const MAPPING_FILE_EXTENSION = ".xmap.json";

export function serializeMapping(mapping: EffectMapping, timingTrackNames: string[]): string {
  return JSON.stringify({ version: 1, mapping, timingTracks: timingTrackNames }, null, 2);
}

export function parseMappingFile(text: string): { mapping: EffectMapping; timingTracks: string[] } | null {
  try {
    const parsed = JSON.parse(text) as { mapping?: unknown; timingTracks?: unknown };
    if (!parsed || typeof parsed.mapping !== "object" || parsed.mapping === null) return null;
    const mapping: EffectMapping = {};
    for (const [key, value] of Object.entries(parsed.mapping as Record<string, unknown>)) {
      if (typeof value === "string" && value) mapping[key] = value;
    }
    const timingTracks = Array.isArray(parsed.timingTracks) ? parsed.timingTracks.filter((t): t is string => typeof t === "string") : [];
    return { mapping, timingTracks };
  } catch {
    return null;
  }
}

/**
 * Merges a loaded mapping into the current one.
 *
 * "When a loaded mapping would overwrite mappings that are already in place, you are prompted to
 * either Replace the existing mappings or Add Additional mappings on top of them, so several maps
 * can be stacked together."
 */
export function mergeMapping(current: EffectMapping, loaded: EffectMapping, mode: "replace" | "add"): EffectMapping {
  if (mode === "replace") return { ...loaded };
  const merged = { ...current };
  for (const [key, value] of Object.entries(loaded)) {
    if (!merged[key]) merged[key] = value;
  }
  return merged;
}

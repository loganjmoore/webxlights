import { defaultParamsFor } from "@webxlights/engine";
import type { ParsedXsq } from "@webxlights/formats";
import { newEffectId } from "../stores/sequencer";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";

// Mapping a parsed `.xsq` onto this project's layout.
//
// Pulled out of the import page because Tools > Convert needs exactly the same mapping without
// creating a sequence: converting an `.xsq` to an `.fseq` is "map it onto the layout, render it,
// write the file", and a converter that mapped differently from the importer would produce a file
// that didn't match what importing the same sequence would show.

export interface MappedXsq {
  body: SequenceBody;
  /** Row names in the file that this layout has no model or group for. */
  unmatchedNames: string[];
}

export function mapXsqToBody(parsed: ParsedXsq, models: ModelRecord[], groups: ModelGroupRecord[]): MappedXsq {
  const modelIdByName = new Map(models.map((m) => [m.name, m.id]));
  // A sequence Element targeting a Model Group has no distinct "group" type in the `.xsq` -
  // xLights writes type="model" for both - so a name miss against models falls back to groups
  // before being reported unmatched. Real sequences target groups constantly.
  const groupIdByName = new Map(groups.map((g) => [g.name, g.id]));

  const unmatchedNames: string[] = [];
  const rows = parsed.rows
    .filter((r) => r.elementType === "model")
    .map((r) => {
      const modelId = modelIdByName.get(r.name);
      const elementId = modelId ?? groupIdByName.get(r.name);
      if (elementId === undefined) {
        unmatchedNames.push(r.name);
        return null;
      }
      return {
        elementType: (modelId !== undefined ? "model" : "group") as "model" | "group",
        elementId,
        effects: r.effects.map((eff) => ({
          id: newEffectId(),
          name: eff.name,
          startMs: eff.startMs,
          endMs: eff.endMs,
          // An effect whose params weren't translated gets the engine's own schema defaults
          // rather than an empty bag: the renderers don't all null-guard every field, so an
          // untranslated effect with `{}` could render as NaN geometry and throw on export.
          params: (eff.translated ? eff.params : defaultParamsFor(eff.name)) as Record<string, number | boolean | string>,
        })),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const timingTracks = parsed.rows
    .filter((r) => r.elementType === "timing")
    .map((r) => ({ name: r.name, marks: r.effects.map((e) => e.startMs) }));

  return { body: { rows, timingTracks }, unmatchedNames };
}

/** A one-line account of what a mapping did, for the import and convert flows alike. */
export function describeMapping(mapped: MappedXsq, parsed: ParsedXsq): string {
  const parts = [`${mapped.body.rows.length} rows`];
  if (mapped.unmatchedNames.length) {
    parts.push(`${mapped.unmatchedNames.length} names had no match in this layout: ${mapped.unmatchedNames.join(", ")}`);
  }
  if (parsed.unsupportedEffectNames.length) {
    parts.push(`effects without full param translation: ${parsed.unsupportedEffectNames.join(", ")}`);
  }
  return parts.join(" — ");
}

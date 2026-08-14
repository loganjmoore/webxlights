import type { ParsedXsq } from "@webxlights/formats";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";
import { applyMapping, autoMapping, donorRows, donorTimingTrackNames, mappingTargets } from "./importMapping";

// Mapping a parsed `.xsq` onto this project's layout *without asking anybody*.
//
// Tools > Convert turns an `.xsq` into an `.fseq` and hands it back; there is no sequence, no
// sequencer, and nowhere to put a mapping dialog. So it maps by name, which is what the import
// dialog starts from before anyone touches it.
//
// That shared starting point is the point: a converter that matched names differently from the
// importer would produce a file that didn't match what importing the same sequence would show,
// and the whole reason to convert rather than import is that you trust the two to agree.

export interface MappedXsq {
  body: SequenceBody;
  /** Row names in the file that this layout has no model or group for. */
  unmatchedNames: string[];
}

export function mapXsqToBody(parsed: ParsedXsq, models: ModelRecord[], groups: ModelGroupRecord[]): MappedXsq {
  const targets = mappingTargets(models, groups);
  const donors = donorRows(parsed);
  const mapping = autoMapping(targets, donors);
  // Convert takes every timing track: there is nobody to ask which ones, and a timing track costs
  // nothing in an `.fseq` - it isn't written to one at all.
  const applied = applyMapping(parsed, targets, mapping, donorTimingTrackNames(parsed));

  const matched = new Set(Object.values(mapping));
  return {
    body: applied.body,
    unmatchedNames: donors.filter((d) => d.effectCount > 0 && !matched.has(d.name)).map((d) => d.name),
  };
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

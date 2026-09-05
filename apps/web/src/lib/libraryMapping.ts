// A library sequence onto your own layout.
//
// The library entry's rows point at the publisher's models by id, which mean nothing here, so
// the entry carries their names (the donor manifest). The same mapping dialog an xsq import uses
// lets you say which of your models takes which of theirs; this turns that answer into a body
// whose rows point at your ids. Effects come across as they are - same engine, same params - with
// fresh ids so two copies in one project never collide.

import type { LibraryDonor, LibrarySequenceRecord, SequenceBody, SequenceEffect } from "./api";
import { newEffectId } from "../stores/sequencer";
import { unusedDonors, type AppliedMapping, type DonorRow, type EffectMapping, type MappingTarget } from "./importMapping";

export function libraryDonorRows(donors: LibraryDonor[]): DonorRow[] {
  return donors.map((d) => ({ name: d.name, effectCount: d.effectCount }));
}

export function applyLibraryMapping(entry: LibrarySequenceRecord, targets: MappingTarget[], mapping: EffectMapping, timingTrackNames: string[]): AppliedMapping {
  const donorByName = new Map(entry.donors.map((d) => [d.name, d]));
  const rowFor = (d: LibraryDonor) => entry.body.rows.find((r) => r.elementType === d.elementType && r.elementId === d.elementId && !r.subName);

  const rows: SequenceBody["rows"] = [];
  for (const target of targets) {
    const donorName = mapping[target.key];
    if (!donorName) continue;
    const donor = donorByName.get(donorName);
    const row = donor ? rowFor(donor) : undefined;
    if (!row || row.effects.length === 0) continue;
    rows.push({
      elementType: target.elementType,
      elementId: target.elementId,
      effects: row.effects.map((eff): SequenceEffect => ({ ...eff, id: newEffectId() })),
    });
  }
  const wanted = new Set(timingTrackNames);
  const timingTracks = entry.body.timingTracks.filter((t) => wanted.has(t.name)).map((t) => ({ ...t, marks: [...t.marks], labels: t.labels ? [...t.labels] : undefined }));

  return { body: { rows, timingTracks }, mappedCount: rows.length, unusedDonorNames: unusedDonors(libraryDonorRows(entry.donors), mapping) };
}

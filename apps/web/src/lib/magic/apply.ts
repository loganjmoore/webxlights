import type { SequenceBody, SequenceEffect, TimingTrack } from "../api";
import type { SongBoundary } from "../songRegions";
import type { Placement } from "./choreograph";
import type { SongMap } from "@webxlights/engine";

// Apply: a generated sequence lands as ordinary effects on ordinary layers, plus the beat, bar
// and section tracks it was built on, as one edit (docs/MAGIC-SEQUENCE.md 2.5).

export type MagicMode = "fill-empty" | "replace" | "new-layers";

export const MAGIC_TRACKS = ["Magic Beats", "Magic Bars", "Magic Sections"] as const;

/** "Chorus 2": the label, numbered when it repeats. */
export function sectionNames(song: SongMap): string[] {
  const totals = new Map<string, number>(), seen = new Map<string, number>();
  for (const s of song.sections) totals.set(s.label, (totals.get(s.label) ?? 0) + 1);
  return song.sections.map((s) => {
    const n = (seen.get(s.label) ?? 0) + 1;
    seen.set(s.label, n);
    const name = s.label === "prechorus" ? "Pre-Chorus" : s.label[0]!.toUpperCase() + s.label.slice(1);
    return totals.get(s.label)! > 1 ? `${name} ${n}` : name;
  });
}

export interface MagicResult {
  body: SequenceBody;
  added: number;
  /** Rows left alone because they already had effects (fill-empty). */
  skippedRows: number;
}

export function magicBody(current: SequenceBody, placements: readonly Placement[], song: SongMap, mode: MagicMode, newId: () => string): MagicResult {
  const body = JSON.parse(JSON.stringify(current)) as SequenceBody;
  if (mode === "replace") body.rows = [];
  const rowKey = (elementType: string, elementId: number) => `${elementType}:${elementId}`;
  const busy = new Set(body.rows.filter((r) => r.effects.length > 0 && !r.subName).map((r) => rowKey(r.elementType, r.elementId)));
  const offsets = new Map<string, number>();
  if (mode === "new-layers") {
    for (const row of body.rows) {
      if (row.subName || row.effects.length === 0) continue;
      const top = Math.max(...row.effects.map((e) => e.layerIndex ?? 0));
      const key = rowKey(row.elementType, row.elementId);
      offsets.set(key, Math.max(offsets.get(key) ?? 0, top + 1));
    }
  }

  let added = 0;
  const skipped = new Set<string>();
  for (const p of placements) {
    const key = rowKey(p.elementType, p.elementId);
    if (mode === "fill-empty" && busy.has(key)) {
      skipped.add(key);
      continue;
    }
    let row = body.rows.find((r) => r.elementType === p.elementType && r.elementId === p.elementId && !r.subName);
    if (!row) body.rows.push((row = { elementType: p.elementType, elementId: p.elementId, effects: [] }));
    const layerIndex = (p.effect.layerIndex ?? 0) + (offsets.get(key) ?? 0);
    const effect: SequenceEffect = { ...JSON.parse(JSON.stringify(p.effect)), id: newId() };
    if (layerIndex) effect.layerIndex = layerIndex;
    else delete effect.layerIndex;
    row.effects.push(effect);
    added++;
  }

  // The grid the sequence was built on, as fixed tracks: replaced on every run, never edited by a
  // stray click.
  const names = sectionNames(song);
  const tracks: TimingTrack[] = [
    { name: "Magic Beats", marks: song.beats.map(Math.round), fixed: true },
    { name: "Magic Bars", marks: song.downbeats.map(Math.round), fixed: true },
    { name: "Magic Sections", marks: song.sections.map((s) => Math.round(s.startMs)), labels: names, fixed: true },
  ];
  body.timingTracks = [...body.timingTracks.filter((t) => !(MAGIC_TRACKS as readonly string[]).includes(t.name)), ...tracks];
  if (mode === "replace" || !body.songBoundaries?.length) {
    body.songBoundaries = song.sections.map((s, i): SongBoundary => ({ ms: Math.round(s.startMs), name: names[i]! }));
  }
  return { body, added, skippedRows: skipped.size };
}

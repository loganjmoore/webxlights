import type { SequenceEffect } from "./api";

// The Select Effect panel (manual: View > Windows).
//
// "Allows the user to select effects based on type, model, and time" for bulk editing.
//
// Block selection can already draw a box round effects, and once selected they can be aligned,
// recoloured in one go, copied as a block or deleted together. What a box can't do is reach the
// things a criterion describes: every Fire in the show, every effect on the mega tree, everything
// in the chorus. Those are the selections a bulk edit is actually for, and a box only finds them
// when they happen to be adjacent on screen.
//
// Criteria are all optional and combine with AND, because that is the only combination anyone can
// hold in their head - "Fire, on the tree, in the chorus" reads as one sentence, where a mixture
// of ANDs and ORs would need explaining in the panel itself.

export interface EffectCriteria {
  /** Effect name, e.g. "Fire". Absent or empty means any. */
  name?: string;
  /** Which rows to look at, as row keys. Absent or empty means all of them. */
  rowKeys?: string[];
  /** Only effects overlapping this window. Absent means the whole sequence. */
  fromMs?: number;
  toMs?: number;
}

export interface CandidateRow {
  key: string;
  effects: readonly SequenceEffect[];
}

/**
 * The effects matching a set of criteria, as ids.
 *
 * Overlap rather than containment for the time window: an effect running through the chorus is
 * part of the chorus, and requiring it to start and end inside would miss the long pad that is
 * usually the thing you were looking for. Touching edges don't count, which is the same rule the
 * selection box and the collision test use.
 */
export function matchingEffectIds(rows: readonly CandidateRow[], criteria: EffectCriteria): string[] {
  const wantedRows = criteria.rowKeys?.length ? new Set(criteria.rowKeys) : null;
  const name = criteria.name?.trim();
  const from = criteria.fromMs;
  const to = criteria.toMs;

  const ids: string[] = [];
  for (const row of rows) {
    if (wantedRows && !wantedRows.has(row.key)) continue;
    for (const effect of row.effects) {
      if (name && effect.name !== name) continue;
      if (from !== undefined && effect.endMs <= from) continue;
      if (to !== undefined && effect.startMs >= to) continue;
      ids.push(effect.id);
    }
  }
  return ids;
}

/**
 * A short description of what a criteria set will select, for the button that runs it.
 *
 * Written out rather than left implicit because the panel's whole risk is selecting more than you
 * meant and then bulk-editing it: "every Fire, everywhere, in the whole sequence" is a sentence
 * that gives someone pause, where three half-filled fields don't.
 */
export function describeCriteria(criteria: EffectCriteria, rowCount: number): string {
  const parts: string[] = [];
  parts.push(criteria.name?.trim() ? `every ${criteria.name.trim()}` : "every effect");
  parts.push(criteria.rowKeys?.length ? `on ${criteria.rowKeys.length} of ${rowCount} rows` : "on every row");
  parts.push(criteria.fromMs !== undefined || criteria.toMs !== undefined ? "in the marked range" : "in the whole sequence");
  return parts.join(", ");
}

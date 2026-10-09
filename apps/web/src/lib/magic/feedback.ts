import type { SectionLabel, SongMap } from "@webxlights/engine";
import type { SequenceBody, SequenceRow } from "../api";
import type { PropInfo, Role, Tier } from "../propRoles";
import type { Placement } from "./choreograph";
import type { Feel, Style } from "./plan";

// The paired data a learned effect picker needs (docs/MAGIC-SEQUENCE.md 6.3): what Magic placed on
// each kind of prop, and what the user kept, removed and added afterwards. A record of the press
// stays on the sequence; the user shares the comparison only when they press Share, and it carries
// roles, effect names, seconds and section summaries, never audio, names or the layout.

interface SongSummary {
  v: 1;
  style: Style;
  feel: Feel;
  bpm: number;
  sections: { label: SectionLabel; energy: number; bars: number }[];
}

/** What a press placed, per row: kept in `metadata.magic`. */
export interface MagicRecord extends SongSummary {
  rows: { key: string; role: Role; tier: Tier; placed: Record<string, number> }[];
}

/** What is shared: per row, seconds of each effect Magic placed and seconds there now. */
export interface MagicFeedback extends SongSummary {
  rows: { role: Role; tier: Tier; placed: Record<string, number>; now: Record<string, number> }[];
}

/** The server takes plain effect names, at most 300 rows. */
const NAME = /^[A-Za-z][A-Za-z ]{0,39}$/;
const MAX_ROWS = 300;

const keyOf = (row: Pick<SequenceRow, "elementType" | "elementId" | "subName">) =>
  row.elementType === "submodel" ? `submodel:${row.elementId}/${row.subName ?? ""}` : `${row.elementType}:${row.elementId}`;

/** Whole seconds of each effect, a moment's effect counting as one. */
function seconds(effects: readonly { name: string; startMs: number; endMs: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of effects) if (NAME.test(e.name)) out[e.name] = (out[e.name] ?? 0) + (e.endMs - e.startMs) / 1000;
  for (const name of Object.keys(out)) out[name] = Math.max(1, Math.round(out[name]!));
  return out;
}

export function magicRecord(song: SongMap, placements: readonly Placement[], props: readonly PropInfo[], style: Style, feel: Feel): MagicRecord {
  const tiers = new Map(props.map((p) => [p.key, p.tier]));
  const byRow = new Map<string, Placement[]>();
  for (const p of placements) (byRow.get(p.key) ?? byRow.set(p.key, []).get(p.key)!).push(p);
  return {
    v: 1, style, feel, bpm: Math.round(song.bpm * 100) / 100,
    sections: song.sections.map((s) => ({ label: s.label, energy: Math.round(s.energy * 100) / 100, bars: Math.max(1, song.downbeats.filter((d) => d >= s.startMs - 1 && d < s.endMs - 1).length) })),
    rows: [...byRow].slice(0, MAX_ROWS).map(([key, list]) => ({ key, role: list[0]!.role, tier: tiers.get(key) ?? "fill", placed: seconds(list.map((p) => p.effect)) })),
  };
}

/** The comparison to share, without which row is which; null when nothing has changed since. */
export function feedbackPayload(record: MagicRecord, body: SequenceBody): MagicFeedback | null {
  const now = new Map(body.rows.map((r) => [keyOf(r), seconds(r.effects)]));
  const same = (a: Record<string, number>, b: Record<string, number>) => Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);
  const rows = record.rows.map(({ role, tier, placed, key }) => ({ role, tier, placed, now: now.get(key) ?? {} }));
  if (rows.every((r) => same(r.placed, r.now))) return null;
  const { v, style, feel, bpm, sections } = record;
  return { v, style, feel, bpm, sections, rows };
}

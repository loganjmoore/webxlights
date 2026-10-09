import type { Placement } from "../../src/lib/magic/choreograph";
import { nativeEffectName } from "../../src/lib/magic/director";
import { priors } from "../../src/lib/magic/priors";
import type { SongMap } from "@webxlights/engine";

// The corpus's own measurements (tools/sequence-corpus/analyze.mjs), applied to a generated
// sequence: rows are the elements, starts within 26 ms are "together".

/**
 * Effects left out of the style comparison, as analyze.mjs does: ones Magic Sequence never places,
 * and the asset effects (Pictures, Shader) it places by its own rule rather than the corpus mix.
 */
const NOT_COMPARED = new Set(["Faces", "Pictures", "Video", "Shader", "State", "DMX", "Moving Head", "Sketch", "Kaleidoscope", "Warp", "Piano", "Guitar", "Liquid", "Off"]);

export function jsd(p: Record<string, number>, q: Record<string, number>): number {
  const keys = new Set([...Object.keys(p), ...Object.keys(q)]);
  const norm = (d: Record<string, number>) => {
    const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
    return (k: string) => (d[k] ?? 0) / total;
  };
  const P = norm(p), Q = norm(q);
  let s = 0;
  for (const k of keys) {
    const m = (P(k) + Q(k)) / 2;
    if (P(k) > 0) s += 0.5 * P(k) * Math.log2(P(k) / m);
    if (Q(k) > 0) s += 0.5 * Q(k) * Math.log2(Q(k) / m);
  }
  return s;
}

export function metrics(song: SongMap, placements: readonly Placement[]) {
  const minutes = song.durationMs / 60000;
  const rows = new Map<string, Placement[]>();
  for (const p of placements) (rows.get(p.key) ?? rows.set(p.key, []).get(p.key)!).push(p);
  const covered = (list: Placement[], from = 0, to = song.durationMs) => {
    const spans = list.map((p) => [Math.max(from, p.effect.startMs), Math.min(to, p.effect.endMs)] as const).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [a, b] of spans) { if (b <= end) continue; total += b - Math.max(a, end); end = b; }
    return total;
  };
  const coverage = new Map<string, number>();
  for (const [key, list] of rows) coverage.set(key, covered(list) / song.durationMs);
  const roleOf = new Map(placements.map((p) => [p.key, p.role]));
  const coverageByRole: Record<string, number> = {};
  for (const [key, c] of coverage) {
    const r = roleOf.get(key)!;
    coverageByRole[r] = (coverageByRole[r] ?? 0) + c / [...roleOf.values()].filter((x) => x === r).length;
  }
  const litShare = song.sections.map((s) => [...rows.values()].reduce((n, list) => n + covered(list, s.startMs, s.endMs) / (s.endMs - s.startMs), 0) / rows.size);
  const starts = new Map<number, Set<string>>();
  for (const p of placements) {
    const q = Math.round(p.effect.startMs / 26);
    (starts.get(q) ?? starts.set(q, new Set()).get(q)!).add(p.key);
  }
  const bigHits = [...starts.values()].filter((s) => s.size >= Math.max(4, 0.4 * rows.size)).length;
  const beatMs = 60000 / song.bpm;
  const near = (marks: readonly number[], t: number) => marks.some((m) => Math.abs(m - t) <= 26);
  const nonZero = placements.filter((p) => p.effect.startMs > 0);
  const onGrid = nonZero.filter((p) => near(song.beats, p.effect.startMs) || near(song.beats, p.effect.startMs - beatMs / 2) || near(song.beats, p.effect.startMs + beatMs / 2)).length / nonZero.length;
  const onBar = nonZero.filter((p) => near(song.downbeats, p.effect.startMs)).length / nonZero.length;
  // Effect share by seconds per role, against the corpus's (both over the corpus's top effects).
  const seconds: Record<string, Record<string, number>> = {};
  for (const p of placements) {
    const r = (seconds[p.role] ??= {});
    const name = nativeEffectName(p.effect.name);
    r[name] = (r[name] ?? 0) + (p.effect.endMs - p.effect.startMs) / 1000;
  }
  const styleByRole: Record<string, number> = {};
  let weighted = 0, weight = 0;
  for (const [role, dist] of Object.entries(seconds)) {
    const full = priors.roles[role]?.effectShareBySeconds;
    if (!full) continue;
    const prior = Object.fromEntries(Object.entries(full).filter(([k]) => !NOT_COMPARED.has(k)));
    const top = Object.fromEntries(Object.entries(dist).filter(([k]) => k in prior));
    const d = jsd(top, prior);
    styleByRole[role] = Math.round(d * 1000) / 1000;
    const w = Object.values(dist).reduce((a, b) => a + b, 0);
    weighted += d * w;
    weight += w;
  }
  return {
    effectsPerMinute: placements.length / minutes, coverage, coverageByRole, litShare, bigHitsPerMinute: bigHits / minutes,
    onGrid, onBar, style: weighted / (weight || 1), styleByRole, rows: rows.size,
  };
}

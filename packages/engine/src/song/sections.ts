// Ported from LightsAutoSequencer js/analysis.js (computergeek1507, GPL-3.0,
// https://github.com/computergeek1507/LightsAutoSequencer, commit b55d5b3f1e5162b41aa01aa29530e7d7fb4dceef).
//
// Changed from the original: boundaries are snapped to 4-bar phrases when the phrase line is
// within a bar, sections under 2 bars are merged into a neighbour and any over 32 bars are split
// at their strongest internal novelty peak; a boundary must stand a deviation above the mean
// novelty rather than just reach it; labels come out as the engine's SectionLabel set (intro,
// verse, prechorus, chorus, bridge, breakdown, solo, outro) instead of the original's free text;
// the chorus must be a high-energy repeated group, the verse the most repeated quieter one, and
// the bridge comes after the second chorus; section energy comes from the per-beat curve rather
// than a separate loudness pass; and the novelty peaks' separation is reported as a confidence.

import type { SectionLabel } from "../songMap";
import { meanStd, timeFrame, type SongFeatures } from "./features";
import { meanVec, rmsDb, unit, type Bar } from "./grid";
import { medianOf } from "./tempo";

/** The boundary detector's findings for one song, in bar indices. */
export interface BoundaryDetection {
  /** Bar-to-bar similarity over a two-bar embedding: repeated passages show up as diagonals. */
  S: Float64Array[];
  /** Boundary strength per bar: novelty plus loudness change, phrase lines favoured. */
  score: Float64Array;
  /** Bars at which a section starts (never 0), ascending. */
  boundaries: number[];
  /** 0..1, how far the chosen peaks stand above the rest. */
  confidence: number;
}

/** A run of bars, [b0, b1). */
export interface BarSpan {
  b0: number;
  b1: number;
}

const MIN_BARS = 8;
const MIN_SECTION_BARS = 2;
const MAX_SECTION_BARS = 32;

export function detectBoundaries(feat: SongFeatures, bars: readonly Bar[], spanSec: number): BoundaryDetection | null {
  const nBars = bars.length;
  if (nBars < MIN_BARS) return null;

  const vecs = bars.map((b) => {
    const f0 = timeFrame(b.s);
    const f1 = Math.max(f0 + 1, timeFrame(b.e));
    const c = unit(meanVec(feat, feat.chroma, 12, f0, f1));
    const bd = meanVec(feat, feat.bands, feat.nb, f0, f1);
    return { c, bd };
  });
  const nb = feat.nb;
  const mu = new Float64Array(nb);
  const sd = new Float64Array(nb);
  for (const v of vecs) for (let d = 0; d < nb; d++) mu[d]! += v.bd[d]! / nBars;
  for (const v of vecs) for (let d = 0; d < nb; d++) sd[d]! += (v.bd[d]! - mu[d]!) ** 2 / nBars;
  for (let d = 0; d < nb; d++) sd[d] = Math.sqrt(sd[d]!) || 1;
  // Chroma says which notes, the z-scored band energies (down-weighted) say how the mix sounds.
  const raw = vecs.map((v) => {
    const out = Array.from(v.c);
    for (let d = 0; d < nb; d++) out.push((0.3 * (v.bd[d]! - mu[d]!)) / sd[d]!);
    return out;
  });
  const similarity = (embedded: number[][]): Float64Array[] => {
    const D: Float64Array[] = [];
    const all: number[] = [];
    for (let i = 0; i < nBars; i++) {
      D.push(new Float64Array(nBars));
      for (let j = 0; j < nBars; j++) {
        let s = 0;
        for (let d = 0; d < embedded[i]!.length; d++) s += (embedded[i]![d]! - embedded[j]![d]!) ** 2;
        D[i]![j] = s;
        if (j > i) all.push(s);
      }
    }
    const sigma2 = medianOf(all) || 1;
    return D.map((row) => row.map((v) => Math.exp(-v / sigma2)));
  };
  // Boundaries come from the plain per-bar matrix. Labels use a two-bar embedding, which makes
  // repeated passages stand out as diagonals but would pull boundaries half a bar early.
  const Sb = similarity(raw);
  const S = similarity(raw.map((v, i) => v.concat(raw[Math.min(nBars - 1, i + 1)]!)));

  // Foote novelty: a checkerboard kernel slid down the diagonal, high where the bars before the
  // point resemble each other, the bars after resemble each other, and the two sides do not.
  const K = Math.min(4, Math.floor(nBars / 4));
  const nov = new Float64Array(nBars);
  for (let i = 1; i < nBars; i++) {
    let s = 0;
    let w = 0;
    for (let a = -K; a < K; a++) {
      for (let b = -K; b < K; b++) {
        const ia = i + a;
        const ib = i + b;
        if (ia < 0 || ib < 0 || ia >= nBars || ib >= nBars) continue;
        const g = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * (K / 2) ** 2));
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        s += sign * g * Sb[ia]![ib]!;
        w += g;
      }
    }
    nov[i] = w ? Math.max(0, s / w) : 0;
  }
  // Big changes in loudness matter for lighting even when the harmony repeats.
  const barDb = bars.map((b) => rmsDb(feat, b.s, b.e));
  const loudNov = new Float64Array(nBars);
  for (let i = 2; i < nBars - 1; i++) {
    const before = (barDb[i - 1]! + barDb[i - 2]!) / 2;
    const after = (barDb[i]! + barDb[i + 1]!) / 2;
    loudNov[i] = Math.abs(after - before);
  }
  const nMax = Math.max(...nov) || 1;
  const lMax = Math.max(...loudNov) || 1;
  const score = new Float64Array(nBars);
  for (let i = 0; i < nBars; i++) score[i] = nov[i]! / nMax + (0.5 * loudNov[i]!) / lMax;

  // Songs move in 4-bar phrases; find the phrase phase and favour it.
  const phase = [0, 1, 2, 3].map((q) => {
    let s = 0;
    for (let i = q; i < nBars; i += 4) s += score[i]!;
    return s;
  });
  const q = phase.indexOf(Math.max(...phase));
  for (let i = 0; i < nBars; i++) if ((i - q) % 4 === 0) score[i]! *= 1.25;

  const [m, sdv] = meanStd(score);
  const cands: number[] = [];
  for (let i = 2; i < nBars - 2; i++) {
    if (score[i]! >= score[i - 1]! && score[i]! >= score[i + 1]!) cands.push(i);
  }
  cands.sort((a, b) => score[b]! - score[a]!);
  const maxSections = Math.max(4, Math.min(16, Math.round(spanSec / 15)));
  const chosen: number[] = [];
  for (const i of cands) {
    // A peak has to stand a full deviation above the song's average novelty. The original's cut
    // was the mean itself, which in a song with nothing to find (a drum loop) carves it up at
    // wherever the noise happens to peak.
    if (score[i]! < m + sdv) break;
    if (chosen.length >= maxSections - 1) break;
    if (chosen.some((c) => Math.abs(c - i) < 4)) continue;
    chosen.push(i);
  }
  chosen.sort((a, b) => a - b);

  const zs = chosen.map((i) => (score[i]! - m) / (sdv || 1));
  const meanZ = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
  const confidence = zs.length ? Math.max(0, Math.min(1, (meanZ - 0.5) / 2.5)) : 0;

  return { S, score, boundaries: snapToPhrases(chosen, score, q, nBars), confidence };
}

/**
 * Moves each boundary onto the song's 4-bar phrase line when that line is a bar away, merges
 * anything the move or the detector left under 2 bars, then splits anything over 32.
 */
function snapToPhrases(chosen: number[], score: Float64Array, phrasePhase: number, nBars: number): number[] {
  const onLine = (i: number) => (((i - phrasePhase) % 4) + 4) % 4 === 0;
  let bounds: number[] = [];
  for (const i of chosen) {
    let at = i;
    if (!onLine(i)) {
      for (const near of [i - 1, i + 1]) {
        if (near >= 1 && near < nBars && onLine(near)) {
          at = near;
          break;
        }
      }
    }
    // Two boundaries can snap to the same line; keep the stronger.
    const clash = bounds.findIndex((b) => b === at);
    if (clash >= 0) {
      if (score[i]! > score[bounds[clash]!]!) bounds[clash] = at;
    } else {
      bounds.push(at);
    }
  }
  bounds.sort((a, b) => a - b);

  // Merge sections under 2 bars into a neighbour by dropping the weaker of the two boundaries
  // around them (the only one, at either end of the song).
  for (;;) {
    const edges = [0, ...bounds, nBars];
    const short = edges.findIndex((e, k) => k + 1 < edges.length && edges[k + 1]! - e < MIN_SECTION_BARS);
    if (short < 0) break;
    const startEdge = short; // index into `bounds` is edge - 1
    const endEdge = short + 1;
    let drop: number;
    if (startEdge === 0) drop = endEdge - 1;
    else if (endEdge === edges.length - 1) drop = startEdge - 1;
    else drop = score[edges[startEdge]!]! <= score[edges[endEdge]!]! ? startEdge - 1 : endEdge - 1;
    bounds = bounds.filter((_, k) => k !== drop);
  }

  // Split any section over 32 bars at its strongest internal novelty peak, until none is left.
  // A flat stretch has no peak to speak of, so ties go to the middle. Each half keeps at least 4
  // bars, which a section over 32 can always afford.
  for (;;) {
    const edges = [0, ...bounds, nBars];
    const long = edges.findIndex((e, k) => k + 1 < edges.length && edges[k + 1]! - e > MAX_SECTION_BARS);
    if (long < 0) break;
    const b0 = edges[long]!;
    const b1 = edges[long + 1]!;
    const mid = (b0 + b1) / 2;
    let best = b0 + 4;
    let bestScore = -Infinity;
    for (let i = b0 + 4; i <= b1 - 4; i++) {
      const s = score[i]! - 1e-6 * Math.abs(i - mid);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    bounds.push(best);
    bounds.sort((a, b) => a - b);
  }
  return bounds;
}

export function spansFromBoundaries(boundaries: readonly number[], nBars: number): BarSpan[] {
  const edges = [0, ...boundaries, nBars];
  return edges.slice(0, -1).map((b0, k) => ({ b0, b1: edges[k + 1]! }));
}

function sectionSimilarity(S: readonly Float64Array[], a: BarSpan, b: BarSpan): number {
  const len = Math.min(a.b1 - a.b0, b.b1 - b.b0);
  let best = 0;
  for (let shift = -1; shift <= 1; shift++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < len; i++) {
      const ia = a.b0 + i;
      const ib = b.b0 + i + shift;
      if (ib < b.b0 || ib >= b.b1 || ib >= S.length) continue;
      s += S[ia]![ib]!;
      c++;
    }
    if (c) best = Math.max(best, s / c);
  }
  return best;
}

function groupLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : "");
}

/**
 * Repeat classes: each section joins the group of the earlier section it resembles most, if that
 * is above a threshold set from the song's own spread of similarities, else starts a new group.
 * Letters go out in order of first appearance.
 */
export function groupSections(S: readonly Float64Array[], spans: readonly BarSpan[]): string[] {
  const sims: number[] = [];
  for (let i = 0; i < spans.length; i++) for (let j = 0; j < i; j++) sims.push(sectionSimilarity(S, spans[j]!, spans[i]!));
  const [sm, ss] = sims.length ? meanStd(Float64Array.from(sims)) : [0, 0];
  const thr = Math.max(0.45, sm + 0.6 * ss);

  const groups: string[] = [];
  let next = 0;
  for (let i = 0; i < spans.length; i++) {
    let best = -1;
    let bestSim = thr;
    for (let j = 0; j < i; j++) {
      const s = sectionSimilarity(S, spans[j]!, spans[i]!);
      if (s > bestSim) {
        bestSim = s;
        best = j;
      }
    }
    groups.push(best >= 0 ? groups[best]! : groupLetter(next++));
  }
  return groups;
}

/**
 * Labels by rule. `energy` is each section's mean of the per-beat curve; the rules read it
 * rescaled across the sections (0 = quietest section, 1 = loudest), which is what "low energy"
 * means within one song.
 *
 * In order: a high-energy repeated group is the chorus (the most repeated of the loud ones); the
 * most repeated quieter group is the verse; a quiet or one-off opening is the intro; a quiet or
 * one-off ending is the outro; a one-off after the second chorus is the bridge (before the
 * pre-chorus test, since a bridge often leads back into the last chorus); a short section leading
 * into a chorus is a pre-chorus; a very quiet one mid-song is a breakdown. What is left is a verse
 * before the first chorus, and after it a bridge, or a solo if it is loud.
 */
export function labelSections(spans: readonly BarSpan[], groups: readonly string[], energy: readonly number[]): SectionLabel[] {
  const lo = Math.min(...energy);
  const hi = Math.max(...energy);
  const rel = energy.map((e) => (hi - lo > 0.05 ? (e - lo) / (hi - lo) : 0.5));

  const byGroup = new Map<string, number[]>();
  groups.forEach((g, i) => byGroup.set(g, [...(byGroup.get(g) ?? []), i]));
  const avg = (g: string): number => {
    const idx = byGroup.get(g)!;
    return idx.reduce((a, i) => a + rel[i]!, 0) / idx.length;
  };
  const count = (g: string): number => byGroup.get(g)!.length;
  const repeated = [...byGroup.keys()].filter((g) => count(g) > 1);

  let chorus: string | null = null;
  let verse: string | null = null;
  if (repeated.length) {
    const top = Math.max(...repeated.map(avg));
    if (top >= 0.5) {
      const loud = repeated.filter((g) => avg(g) >= top - 0.15);
      chorus = loud.reduce((a, b) => (count(b) > count(a) || (count(b) === count(a) && avg(b) > avg(a) + 0.02) ? b : a));
    }
    // The verse is the most repeated of the quieter groups, earliest on a tie. A group that only
    // ever opens and closes the song is its intro and outro material rather than a verse, unless
    // nothing else is left.
    const others = repeated.filter((g) => g !== chorus && (chorus === null || avg(g) < avg(chorus)));
    const interior = others.filter((g) => byGroup.get(g)!.some((i) => i > 0 && i < spans.length - 1));
    const pool = interior.length ? interior : others;
    if (pool.length) {
      verse = pool.reduce((a, b) =>
        count(b) > count(a) || (count(b) === count(a) && byGroup.get(b)![0]! < byGroup.get(a)![0]!) ? b : a,
      );
    }
  }
  const chorusAt = groups.flatMap((g, i) => (g === chorus ? [i] : []));
  const firstChorus = chorusAt[0] ?? -1;
  const secondChorus = chorusAt[1] ?? -1;
  const last = spans.length - 1;

  return spans.map((span, i): SectionLabel => {
    const g = groups[i]!;
    const bars = span.b1 - span.b0;
    const unique = count(g) === 1;
    if (g === chorus) return "chorus";
    if (g === verse) return "verse";
    if (i === 0 && (unique || rel[i]! < 0.4) && bars <= 12) return "intro";
    if (i === last && (unique || rel[i]! < 0.5)) return "outro";
    if (secondChorus >= 0 && i > secondChorus && unique) return "bridge";
    if (i < last && groups[i + 1] === chorus && bars <= 8) return "prechorus";
    if (i > 0 && i < last && rel[i]! < 0.25) return "breakdown";
    if (firstChorus < 0 || i < firstChorus) return "verse";
    if (unique) return rel[i]! >= 0.75 ? "solo" : "bridge";
    return "verse";
  });
}

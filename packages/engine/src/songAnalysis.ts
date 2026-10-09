// Ported from LightsAutoSequencer js/analysis.js (computergeek1507, GPL-3.0,
// https://github.com/computergeek1507/LightsAutoSequencer, commit b55d5b3f1e5162b41aa01aa29530e7d7fb4dceef).
//
// Changed from the original: one synchronous function, samples in and a JSON-safe SongMap out,
// so it runs in a worker (or a test) without an AudioContext or timers. The original's
// analyze() and buildGrid() are the pipeline below; what it did not do, and this adds, is the
// per-beat energy curve, band-limited hits, impacts, confidence figures and section ranking.
// The feature extraction, tempo fit, grid and section code live in ./song/.

import type { SongAnalysisProgress, SongHit, SongMap, SongSection } from "./songMap";
import { detrend, FPS, frameTime, pickPeaks, resampleMono, sdThreshold, spectralFeatures, type Onset, type SongFeatures, type SongModel } from "./song/features";
import { buildGrid, gridFit, gridFromBeats, proBeats, rmsDb } from "./song/grid";
import { detectBoundaries, groupSections, labelSections, spansFromBoundaries } from "./song/sections";
import { detectTempo } from "./song/tempo";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** Seconds to milliseconds, to a tenth of a millisecond: plenty for lights, and short in JSON. */
const ms = (seconds: number): number => Math.round(seconds * 10000) / 10;

function percentile(sorted: readonly number[], p: number): number {
  return sorted.length ? sorted[Math.floor(p * (sorted.length - 1))]! : 0;
}

/**
 * Loudness per beat, 0..1 relative to the song itself.
 *
 * RMS in dB, averaged over a bar so one loud beat doesn't read as a section change, then spread
 * over the song's own 5th to 95th percentile: a quiet carol still has a loudest part. Beats
 * quieter than 60 dB under the loudest are silence and are left out of the percentiles, or a
 * fade-out would stretch the scale. A song at one steady level reads 0.5 throughout rather than
 * having its noise stretched to the full range.
 */
function beatEnergy(feat: SongFeatures, beats: readonly number[], T: number, beatsPerBar: number): number[] {
  if (!beats.length) return [];
  const raw = beats.map((t, i) => rmsDb(feat, t, i + 1 < beats.length ? beats[i + 1]! : t + T));
  const floorDb = Math.max(...raw) - 60;
  const clamped = raw.map((v) => Math.max(v, floorDb));
  const radius = beatsPerBar >> 1;
  const smooth = clamped.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(clamped.length - 1, i + radius); j++) {
      s += clamped[j]!;
      c++;
    }
    return s / c;
  });
  const audible = smooth.filter((_, i) => raw[i]! > floorDb).sort((a, b) => a - b);
  const lo = percentile(audible, 0.05);
  const hi = percentile(audible, 0.95);
  if (hi - lo < 1.5) return smooth.map(() => 0.5);
  return smooth.map((v) => clamp01((v - lo) / (hi - lo)));
}

/**
 * The strongest hits in each band. Candidates are picked the way the tempo onsets are, but at a
 * low threshold so quiet hits are in the running, and then only the strongest 15% per band stay:
 * a hit worth lighting up is one that stands out in its own song.
 */
function findHits(feat: SongFeatures, envelope: Float32Array, kickEnvelope: Float32Array, active: Uint8Array): SongHit[] {
  const bands: { band: SongHit["band"]; z: Float32Array; minGapSec: number }[] = [
    { band: "kick", z: kickEnvelope, minGapSec: 0.1 },
    { band: "snare", z: detrend(feat.drum.snare), minGapSec: 0.1 },
    { band: "hat", z: detrend(feat.drum.hat), minGapSec: 0.06 },
    { band: "full", z: envelope, minGapSec: 0.05 },
  ];
  const hits: SongHit[] = [];
  for (const { band, z, minGapSec } of bands) {
    const peaks = pickPeaks(z, { threshold: sdThreshold(z, 0.3), minGapSec, active });
    const cut = percentile(peaks.map((p) => p.s).sort((a, b) => a - b), 0.85);
    for (const p of peaks) if (p.s >= cut) hits.push({ ms: ms(p.t), strength: Math.round(p.s * 1000) / 1000, band });
  }
  return hits.sort((a, b) => a.ms - b.ms);
}

/**
 * Sudden changes in level: where the next second is much louder or quieter than the last. The
 * ratio is of mean RMS, with a floor of 1% of the loudest frame so a quiet tail or a noise floor
 * doesn't produce enormous ratios out of nothing. Only the local peak of each swing counts, and
 * two impacts are never closer than 2 s, the stronger winning.
 *
 * "A second" is the nearest whole number of beats to one second. A window that holds one kick
 * and then, a beat later, two of them would read a steady drum loop as a series of jumps; over a
 * whole number of beats the same loop gives the same level wherever the window starts.
 */
function findImpacts(feat: SongFeatures, beatSec: number): number[] {
  const w = Math.max(2, Math.round(Math.max(1, Math.round(1 / beatSec)) * beatSec * FPS));
  const n = feat.nFrames;
  if (n < 2 * w + 1) return [];
  const prefix = new Float64Array(n + 1);
  let maxRms = 0;
  for (let f = 0; f < n; f++) {
    prefix[f + 1] = prefix[f]! + feat.rms[f]!;
    maxRms = Math.max(maxRms, feat.rms[f]!);
  }
  const floor = 0.01 * maxRms;
  const ratio = new Float64Array(n).fill(1);
  for (let f = w; f + w <= n; f++) {
    const next = (prefix[f + w]! - prefix[f]!) / w;
    const prev = (prefix[f]! - prefix[f - w]!) / w;
    ratio[f] = (next + floor) / (prev + floor);
  }

  const half = w >> 1;
  const candidates: { f: number; weight: number }[] = [];
  for (let f = w; f + w <= n; f++) {
    const r = ratio[f]!;
    const rise = r > 1.8;
    const drop = r < 0.55;
    if (!rise && !drop) continue;
    let isExtreme = true;
    for (let j = Math.max(w, f - half); j <= Math.min(n - w, f + half); j++) {
      const o = ratio[j]!;
      if ((rise ? o > r : o < r) || (o === r && j < f)) {
        isExtreme = false;
        break;
      }
    }
    if (isExtreme) candidates.push({ f, weight: Math.abs(Math.log(r)) });
  }
  candidates.sort((a, b) => b.weight - a.weight);
  const chosen: number[] = [];
  for (const c of candidates) if (chosen.every((f) => Math.abs(f - c.f) >= 2 * FPS)) chosen.push(c.f);
  return chosen.sort((a, b) => a - b).map((f) => ms(frameTime(f)));
}

function tempoOnsets(feat: SongFeatures, active: Uint8Array) {
  const envelope = detrend(feat.flux);
  const kickEnvelope = detrend(feat.drum.kick);
  const peaks = (z: Float32Array, sensitivity: number, minGapSec: number): Onset[] =>
    pickPeaks(z, { threshold: sdThreshold(z, sensitivity), minGapSec, active });
  return {
    envelope,
    kickEnvelope,
    all: peaks(envelope, 0.6, 0.05),
    kick: peaks(kickEnvelope, 1.0, 0.1),
    snare: peaks(detrend(feat.drum.snare), 1.3, 0.1),
  };
}

/** Mean of `energy` over the beats that start inside [startMs, endMs). */
function meanEnergy(beats: readonly number[], energy: readonly number[], startMs: number, endMs: number): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i]! >= startMs && beats[i]! < endMs) {
      s += energy[i]!;
      c++;
    }
  }
  if (c) return s / c;
  // A section too short to hold a beat takes the level of the nearest one.
  const nearest = beats.reduce((best, b, i) => (Math.abs(b - startMs) < Math.abs(beats[best]! - startMs) ? i : best), 0);
  return energy[nearest] ?? 0.5;
}

export interface SongAnalysisOptions {
  /**
   * Beats and downbeats (seconds) from Beat This!, the pro tracker, used instead of this engine's
   * own tempo and beat grid. Sections, energy, hits and impacts are still this engine's.
   */
  grid?: { beats: readonly number[]; downbeats: readonly number[] };
}

export function analyzeSong(samples: Float32Array, sampleRate: number, onProgress?: SongAnalysisProgress, options: SongAnalysisOptions = {}): SongMap {
  if (!(sampleRate > 0)) throw new Error(`analyzeSong: sample rate ${sampleRate} is not positive`);
  const progress = onProgress ?? (() => {});
  const duration = samples.length / sampleRate;
  const durationMs = Math.round(duration * 10000) / 10;

  progress(0.02, "Resampling");
  const x = resampleMono(samples, sampleRate);
  const feat = spectralFeatures(x, progress);

  progress(0.72, "Finding hits");
  let maxRms = 0;
  for (const v of feat.rms) maxRms = Math.max(maxRms, v);
  const active = new Uint8Array(feat.nFrames);
  let first = -1;
  let last = -1;
  for (let i = 0; i < feat.nFrames; i++) {
    if (feat.rms[i]! > maxRms * 0.01) {
      // -40 dB under the loudest frame
      active[i] = 1;
      if (first < 0) first = i;
      last = i;
    }
  }
  const onsets = tempoOnsets(feat, active);
  const model: SongModel = {
    feat,
    onsets,
    songStart: first >= 0 ? frameTime(first) : 0,
    songEnd: last >= 0 ? frameTime(last) : duration,
    duration,
  };

  progress(0.8, "Fitting the tempo");
  const tempo = detectTempo(onsets);
  const pro = options.grid && options.grid.beats.length >= 8 ? proBeats(model, options.grid.beats, options.grid.downbeats) : undefined;
  const ibis = pro ? pro.beats.slice(1).map((b, i) => b - pro.beats[i]!).sort((a, b) => a - b) : [];
  const bpm = pro ? Math.round((60 / ibis[Math.floor(ibis.length / 2)]!) * 1000) / 1000 : tempo.bpm;
  const T = 60 / bpm;

  progress(0.86, "Finding bars and sections");
  const grid = pro ? gridFromBeats(model, pro.beats, pro.downbeats) : buildGrid(model, tempo.bpm, tempo.offset);
  const beatsMs = grid.beats.map(ms);
  const energy = beatEnergy(feat, grid.beats, T, grid.beatsPerBar).map((v) => Math.round(v * 1000) / 1000);

  const detection = detectBoundaries(feat, grid.bars, model.songEnd - model.songStart);
  let sections: SongSection[];
  if (detection) {
    const spans = spansFromBoundaries(detection.boundaries, grid.bars.length);
    const startMs = spans.map((span, i) => (i === 0 ? 0 : ms(grid.bars[span.b0]!.s)));
    const endMs = spans.map((_, i) => (i === spans.length - 1 ? durationMs : startMs[i + 1]!));
    const sectionEnergy = spans.map((_, i) => meanEnergy(beatsMs, energy, startMs[i]!, endMs[i]!));
    const groups = groupSections(detection.S, spans);
    const labels = labelSections(spans, groups, sectionEnergy);
    sections = spans.map((_, i) => ({
      startMs: startMs[i]!,
      endMs: endMs[i]!,
      label: labels[i]!,
      group: groups[i]!,
      energy: Math.round(sectionEnergy[i]! * 1000) / 1000,
      rank: 0,
    }));
  } else {
    // Too short to have structure: one section, called the verse because that is the label
    // that asks the least of whatever reads it.
    sections = [{ startMs: 0, endMs: durationMs, label: "verse", group: "A", energy: meanEnergy(beatsMs, energy, 0, durationMs), rank: 0 }];
  }
  [...sections]
    .sort((a, b) => b.energy - a.energy)
    .forEach((section, rank) => {
      section.rank = rank;
    });

  progress(0.94, "Finding hits and impacts");
  const strong = tempo.anchor.filter((o) => o.s > 0.3);
  // The pro grid is a neural net's, not a fit: judge it by how many strong onsets sit on it.
  const beatConfidence = pro
    ? clamp01(gridFit(strong, grid.beats, T))
    : tempo.found
      ? clamp01(0.5 * Math.min(1, tempo.R / 0.8) + 0.5 * gridFit(strong, grid.beats, T))
      : 0;

  const map: SongMap = {
    version: 1,
    durationMs,
    bpm,
    beats: beatsMs,
    downbeats: grid.downbeats.map(ms),
    beatsPerBar: grid.beatsPerBar,
    sections,
    energy,
    hits: findHits(feat, onsets.envelope, onsets.kickEnvelope, active),
    impacts: findImpacts(feat, T),
    confidence: { beats: Math.round(beatConfidence * 1000) / 1000, sections: Math.round((detection?.confidence ?? 0) * 1000) / 1000 },
    source: pro ? "pro" : "browser",
  };
  progress(1, "Done");
  return map;
}

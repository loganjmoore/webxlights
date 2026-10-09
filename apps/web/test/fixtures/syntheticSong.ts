import type { SectionLabel, SongMap } from "@webxlights/engine";

/** A SongMap as the analyser would produce it, built from a section list (8-bar units by default). */
export function syntheticSong(bpm = 120, plan: [SectionLabel, string, number, number][] = [
  ["intro", "I", 8, 0.15], ["verse", "A", 16, 0.45], ["chorus", "B", 16, 0.85], ["verse", "A", 16, 0.5],
  ["chorus", "B", 16, 0.9], ["bridge", "C", 8, 0.35], ["chorus", "B", 16, 1], ["outro", "O", 8, 0.1],
]): SongMap {
  const beatMs = 60000 / bpm;
  const beats: number[] = [], downbeats: number[] = [], energy: number[] = [], hits: SongMap["hits"] = [];
  const sections: SongMap["sections"] = [];
  let beat = 0;
  for (const [label, group, bars, e] of plan) {
    const startMs = beat * beatMs;
    for (let i = 0; i < bars * 4; i++, beat++) {
      const t = beat * beatMs;
      beats.push(t);
      if (i % 4 === 0) downbeats.push(t);
      energy.push(Math.max(0, Math.min(1, e + 0.05 * Math.sin(beat))));
      if (e > 0.3) hits.push({ ms: t, strength: i % 2 === 0 ? 0.9 : 0.65, band: i % 2 === 0 ? "kick" : "snare" });
    }
    sections.push({ startMs, endMs: beat * beatMs, label, group, energy: e, rank: 0 });
  }
  [...sections].sort((a, b) => b.energy - a.energy).forEach((s, i) => (s.rank = i));
  const durationMs = beat * beatMs;
  const impacts = sections.slice(1).filter((s, i) => s.energy > sections[i]!.energy * 1.8).map((s) => s.startMs);
  return { version: 2, durationMs, bpm, beats, downbeats, beatsPerBar: 4, sections, energy, hits, impacts, rests: [], confidence: { beats: 1, sections: 1 }, source: "browser" };
}

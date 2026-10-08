import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { magicBody, sectionNames } from "../src/lib/magic/apply";
import type { Placement } from "../src/lib/magic/choreograph";
import type { SequenceBody } from "../src/lib/api";
import { useSequencerStore } from "../src/stores/sequencer";
import { syntheticSong } from "./fixtures/syntheticSong";

const song = syntheticSong(120, [["intro", "I", 4, 0.2], ["chorus", "B", 4, 0.9], ["verse", "A", 4, 0.4], ["chorus", "B", 4, 0.95]]);
const placement = (elementType: "model" | "group", elementId: number, startMs: number, layerIndex = 0): Placement => ({
  elementType, elementId, key: `${elementType}:${elementId}`, role: "arch",
  effect: { name: "On", startMs, endMs: startMs + 500, params: {}, ...(layerIndex ? { layerIndex } : {}) },
});
const placements = [placement("model", 1, 0), placement("model", 1, 0, 1), placement("model", 2, 500), placement("group", 9, 1000)];
const existing: SequenceBody = {
  timingTracks: [{ name: "Lyrics", marks: [0, 1000] }, { name: "Magic Beats", marks: [1], fixed: true }],
  rows: [{ elementType: "model", elementId: 2, effects: [{ id: "mine", name: "Bars", startMs: 0, endMs: 1000, params: {}, layerIndex: 1 }] }],
};
let n = 0;
const newId = () => `m${n++}`;

describe("applying a generated sequence", () => {
  it("names repeated sections by number", () => {
    expect(sectionNames(song)).toEqual(["Intro", "Chorus 1", "Verse", "Chorus 2"]);
  });

  it("fills only the empty rows by default, leaving the user's effects alone", () => {
    const { body, added, skippedRows } = magicBody(existing, placements, song, "fill-empty", newId);
    expect(added).toBe(3);
    expect(skippedRows).toBe(1);
    expect(body.rows.find((r) => r.elementId === 2)!.effects.map((e) => e.id)).toEqual(["mine"]);
    expect(body.rows.find((r) => r.elementType === "group")!.effects).toHaveLength(1);
  });

  it("replaces everything, or stacks new layers above what is there", () => {
    const replaced = magicBody(existing, placements, song, "replace", newId).body;
    expect(replaced.rows.flatMap((r) => r.effects).some((e) => e.id === "mine")).toBe(false);
    expect(replaced.rows.flatMap((r) => r.effects)).toHaveLength(4);
    const stacked = magicBody(existing, placements, song, "new-layers", newId).body;
    const row2 = stacked.rows.find((r) => r.elementId === 2)!.effects;
    expect(row2.find((e) => e.id === "mine")!.layerIndex).toBe(1);
    expect(row2.find((e) => e.id !== "mine")!.layerIndex).toBe(2);
  });

  it("adds fixed Magic Beats, Bars and Sections tracks, replacing an earlier run's, and the song regions", () => {
    const { body } = magicBody(existing, placements, song, "fill-empty", newId);
    expect(body.timingTracks.map((t) => t.name)).toEqual(["Lyrics", "Magic Beats", "Magic Bars", "Magic Sections"]);
    expect(body.timingTracks.slice(1).every((t) => t.fixed)).toBe(true);
    expect(body.timingTracks[1]!.marks).toHaveLength(song.beats.length);
    expect(body.timingTracks[3]!.labels).toEqual(["Intro", "Chorus 1", "Verse", "Chorus 2"]);
    expect(body.songBoundaries!.map((b) => b.name)).toEqual(["Intro", "Chorus 1", "Verse", "Chorus 2"]);
    // A user's own regions survive a fill; a replace takes them over.
    const mine = { ...existing, songBoundaries: [{ ms: 0, name: "Mine" }] };
    expect(magicBody(mine, placements, song, "fill-empty", newId).body.songBoundaries).toEqual([{ ms: 0, name: "Mine" }]);
    expect(magicBody(mine, placements, song, "replace", newId).body.songBoundaries).toHaveLength(4);
  });

  it("writes a sub-model's effects to its own row, and fills around one that is in use", () => {
    const star: Placement = { elementType: "submodel", elementId: 1, subName: "Star", key: "submodel:1/Star", role: "star", effect: { name: "On", startMs: 0, endMs: 500, params: {} } };
    const fresh = magicBody({ rows: [], timingTracks: [] }, [star, placement("model", 1, 0)], song, "fill-empty", newId).body;
    expect(fresh.rows.map((r) => [r.elementType, r.elementId, r.subName ?? null, r.effects.length])).toEqual([["submodel", 1, "Star", 1], ["model", 1, null, 1]]);
    const used: SequenceBody = { timingTracks: [], rows: [{ elementType: "submodel", elementId: 1, subName: "Star", effects: [{ id: "mine", name: "Bars", startMs: 0, endMs: 100, params: {} }] }] };
    const filled = magicBody(used, [star, placement("model", 1, 0)], song, "fill-empty", newId);
    expect(filled.skippedRows).toBe(1);
    expect(filled.body.rows.find((r) => r.subName === "Star")!.effects.map((e) => e.id)).toEqual(["mine"]);
  });

  it("undoes the whole thing with one Ctrl+Z", () => {
    setActivePinia(createPinia());
    const store = useSequencerStore();
    store.body = JSON.parse(JSON.stringify(existing));
    store.replaceBody(magicBody(store.body, placements, song, "replace", newId).body);
    expect(store.body.rows.flatMap((r) => r.effects)).toHaveLength(4);
    store.undo();
    expect(store.body).toEqual(existing);
  });
});

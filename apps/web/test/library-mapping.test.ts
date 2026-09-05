import { describe, expect, it } from "vitest";
import type { LibrarySequenceRecord } from "../src/lib/api";
import { applyLibraryMapping, libraryDonorRows } from "../src/lib/libraryMapping";
import { autoMapping, mappingTargets } from "../src/lib/importMapping";

const entry: LibrarySequenceRecord = {
  id: 1, title: "Carol", description: null, author: null, user_id: 1, frame_ms: 50, duration_ms: 4000, audio_filename: null, has_audio: false, uses: 0, created_at: null,
  donors: [
    { name: "Garage Matrix", elementType: "model", elementId: 7, type: "Matrix", effectCount: 1 },
    { name: "Arch 1", elementType: "model", elementId: 8, type: "Arches", effectCount: 1 },
    { name: "All", elementType: "group", elementId: 2, type: "Group", effectCount: 1 },
  ],
  timing_track_names: ["Beats", "Lyrics"],
  body: {
    timingTracks: [{ name: "Beats", marks: [0, 1000] }, { name: "Lyrics", marks: [0, 500], labels: ["la", ""] }],
    rows: [
      { elementType: "model", elementId: 7, effects: [{ id: "a", name: "ColorWash", startMs: 0, endMs: 1000, params: { speed: 2 } }] },
      { elementType: "model", elementId: 8, effects: [{ id: "b", name: "On", startMs: 0, endMs: 500, params: {} }] },
      { elementType: "group", elementId: 2, effects: [{ id: "c", name: "Bars", startMs: 0, endMs: 500, params: {} }] },
    ],
  },
};
const models = [{ id: 21, name: "garage matrix" }, { id: 22, name: "Roof" }] as never;
const groups = [{ id: 5, name: "All" }] as never;

describe("a library sequence onto my layout", () => {
  it("lists the publisher's rows as donors the dialog can offer", () => {
    expect(libraryDonorRows(entry.donors)).toEqual([{ name: "Garage Matrix", effectCount: 1 }, { name: "Arch 1", effectCount: 1 }, { name: "All", effectCount: 1 }]);
  });

  it("points mapped rows at my ids, with fresh effect ids, and says what was left behind", () => {
    const targets = mappingTargets(models, groups);
    const mapping = { ...autoMapping(targets, libraryDonorRows(entry.donors)), "model:Roof": "Arch 1" };
    const applied = applyLibraryMapping(entry, targets, mapping, ["Beats"]);
    expect(applied.body.rows.map((r) => [r.elementType, r.elementId, r.effects[0]!.name])).toEqual([
      ["model", 21, "ColorWash"], ["model", 22, "On"], ["group", 5, "Bars"],
    ]);
    expect(applied.body.rows[0]!.effects[0]!.id).not.toBe("a");
    expect(applied.body.rows[0]!.effects[0]!.params).toEqual({ speed: 2 });
    expect(applied.body.timingTracks.map((t) => t.name)).toEqual(["Beats"]);
    expect(applied.mappedCount).toBe(3);
    expect(applied.unusedDonorNames).toEqual([]);
  });

  it("leaves donors nobody chose behind and reports them", () => {
    const targets = mappingTargets(models, groups);
    const applied = applyLibraryMapping(entry, targets, { "model:garage matrix": "Garage Matrix" }, []);
    expect(applied.body.rows).toHaveLength(1);
    expect(applied.unusedDonorNames).toEqual(["Arch 1", "All"]);
  });
});

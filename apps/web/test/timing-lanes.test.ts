import { describe, expect, it } from "vitest";
import type { TimingTrack } from "../src/lib/api";
import { cellAt, firstCellEndingAfter, timingLanes } from "../src/lib/timingLanes";

/** A labelled track: one label per cell, then the closing mark every real one carries. */
function labelled(name: string, labels: string[], cellMs = 1000): TimingTrack {
  return {
    name,
    marks: [...labels.map((_, i) => i * cellMs), labels.length * cellMs],
    labels: [...labels, ""],
  };
}

const titles = (tracks: TimingTrack[]): string[] => timingLanes(tracks).map((l) => l.title);

describe("which timing tracks become lanes", () => {
  it("stacks an Auto lyrics breakdown as phrases, words, phonemes, wherever the body put them", () => {
    const tracks = [
      { name: "Beats", marks: [0, 500, 1000] },
      labelled("Lyrics — Phonemes", ["MBP", "AI"]),
      labelled("Magic Sections", ["Verse"]),
      labelled("Lyrics", ["hi there"]),
      labelled("Lyrics — Words", ["hi", "there"]),
    ];
    const lanes = timingLanes(tracks);
    expect(lanes.map((l) => l.title)).toEqual(["Magic Sections", "Lyrics", "Words", "Phonemes"]);
    // The track index is the body's, not the lane's: it is what a double-click acts on.
    expect(lanes.map((l) => l.trackIndex)).toEqual([2, 3, 4, 1]);
    expect(lanes.map((l) => l.depth)).toEqual([0, 0, 1, 1]);
    expect(lanes.map((l) => l.layer)).toEqual(["phrases", "phrases", "words", "phonemes"]);
  });

  it("does the same for a Papagayo voice, and drops the Phrases suffix from the title", () => {
    const tracks = [
      labelled("Anna — Phonemes", ["E"]),
      labelled("Anna — Words", ["hey"]),
      labelled("Anna — Phrases", ["hey"]),
      labelled("Ben — Phrases", ["yo"]),
      labelled("Ben — Words", ["yo"]),
    ];
    expect(titles(tracks)).toEqual(["Anna", "Words", "Phonemes", "Ben", "Words"]);
  });

  it("gives a track with no labels no lane", () => {
    expect(titles([{ name: "Magic Beats", marks: [0, 500, 1000] }, labelled("Lyrics", ["a"]), { name: "Bars", marks: [0, 1], labels: ["", ""] }])).toEqual([
      "Lyrics",
    ]);
  });

  it("still shows a Words track whose phrases are missing, in the body's order", () => {
    const tracks = [labelled("Chorus", ["x"]), labelled("Lyrics — Words", ["la", "la"]), labelled("Verse", ["y"])];
    const lanes = timingLanes(tracks);
    expect(lanes.map((l) => l.title)).toEqual(["Chorus", "Words", "Verse"]);
    expect(lanes[1]).toMatchObject({ trackIndex: 1, depth: 1, layer: "words" });
  });

  it("leaves rests and empty labels as gaps rather than cells", () => {
    const [lane] = timingLanes([labelled("Lyrics — Phonemes", ["AI", "rest", "", "E", "Rest"])]);
    expect(lane!.cells).toEqual([
      { startMs: 0, endMs: 1000, label: "AI" },
      { startMs: 3000, endMs: 4000, label: "E" },
    ]);
    // The marks stay whole: a mark beside a rest is still a mark you can grab or delete.
    expect(lane!.marks).toHaveLength(6);
  });
});

describe("finding a cell by time", () => {
  const [lane] = timingLanes([labelled("Lyrics", ["a", "", "c", "d"], 100)]);
  const cells = lane!.cells;

  it("finds the cell holding a time, and the one that starts on a boundary", () => {
    expect(cellAt(cells, 50)?.label).toBe("a");
    expect(cellAt(cells, 200)?.label).toBe("c");
    expect(cellAt(cells, 300)?.label).toBe("d");
  });

  it("finds nothing in a gap or past the end", () => {
    expect(cellAt(cells, 150)).toBeUndefined();
    expect(cellAt(cells, 400)).toBeUndefined();
    expect(cellAt([], 10)).toBeUndefined();
  });

  it("starts a visible-range scan at the first cell that reaches into view", () => {
    expect(firstCellEndingAfter(cells, 0)).toBe(0);
    expect(firstCellEndingAfter(cells, 100)).toBe(1);
    expect(firstCellEndingAfter(cells, 1000)).toBe(cells.length);
  });
});

import { describe, expect, it } from "vitest";
import { labelAt, labelsFromTrack, labelsWithin, splitLabel } from "../src/timing";

describe("timing track labels", () => {
  it("builds a cell from each labelled mark to the next", () => {
    const cells = labelsFromTrack([0, 500, 1000], ["eyesleft", "wink", "eyesright"]);
    // Three marks make two cells: the last mark opens nothing.
    expect(cells).toEqual([
      { startMs: 0, endMs: 500, label: "eyesleft" },
      { startMs: 500, endMs: 1000, label: "wink" },
    ]);
  });

  it("keeps a label with the mark it was authored against, not with its position after sorting", () => {
    // The same bug the song-region boundaries had: sorting the marks first hands each label to
    // whichever mark happens to land at that index, which silently relabels the whole track.
    const cells = labelsFromTrack([1000, 0, 500], ["third", "first", "second"]);
    expect(cells.map((c) => c.label)).toEqual(["first", "second"]);
    expect(cells[0]).toEqual({ startMs: 0, endMs: 500, label: "first" });
  });

  it("drops unlabelled cells", () => {
    const cells = labelsFromTrack([0, 100, 200, 300], ["a", "", "  ", "d"]);
    expect(cells).toEqual([{ startMs: 0, endMs: 100, label: "a" }]);
  });

  it("finds the cell at a moment, and nothing between cells", () => {
    const cells = labelsFromTrack([0, 100, 500, 600], ["a", "", "c"]);
    expect(labelAt(cells, 50)?.label).toBe("a");
    expect(labelAt(cells, 100)).toBeUndefined(); // the unlabelled gap
    expect(labelAt(cells, 550)?.label).toBe("c");
  });

  it("counts a cell that straddles the start of a span", () => {
    const cells = labelsFromTrack([0, 1000, 2000], ["a", "b"]);
    expect(labelsWithin(cells, 500, 1500).map((c) => c.label)).toEqual(["a", "b"]);
    expect(labelsWithin(cells, 1200, 1500).map((c) => c.label)).toEqual(["b"]);
  });

  it("splits a label on the three separators both effects allow", () => {
    expect(splitLabel("C F A")).toEqual(["C", "F", "A"]);
    expect(splitLabel("100,20,3")).toEqual(["100", "20", "3"]);
    expect(splitLabel("60:64:67")).toEqual(["60", "64", "67"]);
    expect(splitLabel("  ")).toEqual([]);
  });
});

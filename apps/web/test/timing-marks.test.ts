import { describe, expect, it } from "vitest";
import { withLabelSet, withMarkRemoved, withMarksAdded } from "../src/lib/timingMarks";

describe("adding marks to a track", () => {
  it("keeps them in order", () => {
    expect(withMarksAdded({ marks: [0, 1000] }, [500, 250]).marks).toEqual([0, 250, 500, 1000]);
  });

  it("keeps every label on its own mark", () => {
    // Labels are positional, so an insert that doesn't move them puts every later word on the
    // wrong phrase - which nothing reports, and which only shows up when the lyrics play back a
    // phrase late.
    const track = { marks: [0, 1000, 2000], labels: ["one", "two", "three"] };
    const next = withMarksAdded(track, [500]);
    expect(next.marks).toEqual([0, 500, 1000, 2000]);
    expect(next.labels).toEqual(["one", "", "two", "three"]);
  });

  it("gives a new mark a blank label rather than the one it was cut out of", () => {
    // A subdivision of "Chorus" is not four more Choruses, and a blank is something you can see
    // needs filling in.
    const next = withMarksAdded({ marks: [0, 1000], labels: ["Chorus", "Verse"] }, [250, 500, 750]);
    expect(next.labels).toEqual(["Chorus", "", "", "", "Verse"]);
  });

  it("leaves a track that never had labels without any", () => {
    // A column of empty strings on every beat track would make each of them look like a lyric
    // track someone had cleared.
    expect(withMarksAdded({ marks: [0] }, [500]).labels).toBeUndefined();
  });

  it("drops a mark the track already has rather than doubling it", () => {
    const track = { marks: [0, 500, 1000], labels: ["a", "b", "c"] };
    const next = withMarksAdded(track, [500, 750]);
    expect(next.marks).toEqual([0, 500, 750, 1000]);
    expect(next.labels).toEqual(["a", "b", "", "c"]);
  });

  it("returns the track itself when there is nothing to add", () => {
    // Identity is what the store checks to decide whether the edit is worth an undo entry.
    const track = { marks: [0, 500] };
    expect(withMarksAdded(track, [500])).toBe(track);
    expect(withMarksAdded(track, [])).toBe(track);
  });
});

describe("removing a mark", () => {
  it("takes its label with it", () => {
    const next = withMarkRemoved({ marks: [0, 1000, 2000], labels: ["one", "two", "three"] }, 1000);
    expect(next.marks).toEqual([0, 2000]);
    expect(next.labels).toEqual(["one", "three"]);
  });

  it("returns the track itself for a mark that isn't there", () => {
    const track = { marks: [0, 1000] };
    expect(withMarkRemoved(track, 500)).toBe(track);
  });
});

describe("setting a label", () => {
  it("fills the list out first", () => {
    // A track with a label on only its third mark would otherwise get the new one at index 0.
    const next = withLabelSet({ marks: [0, 1000, 2000] }, 2, "Bridge");
    expect(next.labels).toEqual(["", "", "Bridge"]);
  });

  it("refuses an index the track doesn't have", () => {
    const track = { marks: [0, 1000] };
    expect(withLabelSet(track, 5, "x")).toBe(track);
    expect(withLabelSet(track, -1, "x")).toBe(track);
  });
});

import { describe, expect, it } from "vitest";
import {
  REGION_COLORS,
  boundariesFromTimingTrack,
  effectsInRegion,
  rebaseEffects,
  regionAt,
  regionsFrom,
  type SongBoundary,
} from "../src/lib/songRegions";
import type { SequenceEffect } from "../src/lib/api";

const boundaries: SongBoundary[] = [
  { ms: 0, name: "Intro" },
  { ms: 10_000, name: "Verse" },
  { ms: 20_000, name: "Chorus" },
];

function effect(over: Partial<SequenceEffect> & { id: string }): SequenceEffect {
  return { name: "On", startMs: 0, endMs: 1000, params: {}, ...over };
}

describe("turning boundaries into regions", () => {
  it("runs each region up to the next boundary, and the last to the end", () => {
    const regions = regionsFrom(boundaries, 30_000);
    expect(regions.map((r) => [r.startMs, r.endMs])).toEqual([
      [0, 10_000],
      [10_000, 20_000],
      [20_000, 30_000],
    ]);
  });

  it("sorts boundaries that arrive out of order", () => {
    const regions = regionsFrom([...boundaries].reverse(), 30_000);
    expect(regions.map((r) => r.name)).toEqual(["Intro", "Verse", "Chorus"]);
  });

  it("drops a boundary past the end of the sequence", () => {
    // A region starting after the music has finished can't contain anything.
    expect(regionsFrom([...boundaries, { ms: 99_000, name: "Ghost" }], 30_000)).toHaveLength(3);
  });

  it("never gives neighbouring regions the same colour", () => {
    const regions = regionsFrom(boundaries, 30_000);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.colorIndex).not.toBe(regions[i - 1]!.colorIndex);
    }
    expect(REGION_COLORS.length).toBeGreaterThan(1);
  });

  it("has no regions at all when nothing has been marked", () => {
    expect(regionsFrom([], 30_000)).toEqual([]);
  });

  it("finds the region a moment is in, and none past the end", () => {
    const regions = regionsFrom(boundaries, 30_000);
    expect(regionAt(regions, 0)?.name).toBe("Intro");
    expect(regionAt(regions, 9_999)?.name).toBe("Intro");
    expect(regionAt(regions, 10_000)?.name).toBe("Verse"); // a boundary belongs to what it starts
    expect(regionAt(regions, 30_000)).toBeUndefined();
  });
});

describe("building regions from a timing track", () => {
  it("uses each mark's label as the region name", () => {
    // "xLights creates one region for each timing mark, using the timing mark's label as the
    // region name."
    const track = { name: "Phrases", marks: [0, 5000], labels: ["Intro", "Verse"] };
    expect(boundariesFromTimingTrack(track)).toEqual([
      { ms: 0, name: "Intro" },
      { ms: 5000, name: "Verse" },
    ]);
  });

  it("names an unlabelled mark by its position rather than leaving it blank", () => {
    // An unnamed region is indistinguishable from its neighbours in the one place regions help.
    expect(boundariesFromTimingTrack({ name: "Beats", marks: [0, 500] })).toEqual([
      { ms: 0, name: "Section 1" },
      { ms: 500, name: "Section 2" },
    ]);
  });

  it("keeps each label with the mark it was authored against", () => {
    // Sorting the marks first and then indexing the labels would hand "Chorus" to whichever mark
    // happened to be earliest - the same thing only when the track was already in order.
    const track = { name: "T", marks: [1000, 0], labels: ["Later", "Earlier"] };
    expect(boundariesFromTimingTrack(track)).toEqual([
      { ms: 0, name: "Earlier" },
      { ms: 1000, name: "Later" },
    ]);
  });
});

describe("a region's effects", () => {
  const regions = regionsFrom(boundaries, 30_000);
  const verse = regions[1]!;

  it("takes the effects that start inside it", () => {
    const effects = [
      effect({ id: "before", startMs: 5_000, endMs: 6_000 }),
      effect({ id: "inside", startMs: 12_000, endMs: 13_000 }),
      effect({ id: "after", startMs: 25_000, endMs: 26_000 }),
    ];
    expect(effectsInRegion(effects, verse).map((e) => e.id)).toEqual(["inside"]);
  });

  it("gives a straddling effect to the region it began in", () => {
    // Splitting it would change what the sequence renders; counting it in both would duplicate
    // it on every copy.
    const straddles = effect({ id: "straddles", startMs: 19_500, endMs: 21_000 });
    expect(effectsInRegion([straddles], regions[1]!).map((e) => e.id)).toEqual(["straddles"]);
    expect(effectsInRegion([straddles], regions[2]!)).toEqual([]);
  });
});

describe("copying one region onto another", () => {
  const regions = regionsFrom(boundaries, 30_000);
  let n = 0;
  const newId = () => `copy-${n++}`;

  it("rebases the times on the target's start", () => {
    // A chorus copied onto a later chorus should land in step with it, not at the same absolute
    // moment - which would put it back where it already was.
    const source = [effect({ id: "a", startMs: 11_000, endMs: 12_000 })];
    const copied = rebaseEffects(source, regions[1]!, regions[2]!, newId);
    expect(copied[0]!.startMs).toBe(21_000);
    expect(copied[0]!.endMs).toBe(22_000);
  });

  it("gives each copy a new id", () => {
    const source = [effect({ id: "a", startMs: 11_000, endMs: 12_000 })];
    expect(rebaseEffects(source, regions[1]!, regions[2]!, newId)[0]!.id).not.toBe("a");
  });

  it("deep-copies, so editing the copy doesn't change the original", () => {
    const source = [effect({ id: "a", startMs: 11_000, endMs: 12_000, params: { speed: 5 } })];
    const copied = rebaseEffects(source, regions[1]!, regions[2]!, newId);
    (copied[0]!.params as Record<string, unknown>).speed = 99;
    expect(source[0]!.params.speed).toBe(5);
  });

  it("drops an effect that wouldn't fit rather than trimming it", () => {
    // A half-length copy of an effect is a different effect, and silently shortening one is
    // worse than not copying it.
    const source = [effect({ id: "long", startMs: 11_000, endMs: 19_000 })];
    const shortTarget = { name: "Tiny", startMs: 20_000, endMs: 21_000, colorIndex: 0 };
    expect(rebaseEffects(source, regions[1]!, shortTarget, newId)).toEqual([]);
  });
});

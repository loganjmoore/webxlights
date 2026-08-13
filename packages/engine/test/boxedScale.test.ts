import { describe, expect, it } from "vitest";
import { chooseBoxedScaleReading, type PlaceableModel } from "../src/models/boxedScale";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import { screenFromAttrs } from "../src/models/placement";
import { transformedHalfExtents } from "../src/models/transform";

const SPACING = 4; // the canvases' NODE_SPACING

function widthOf(model: PlaceableModel, reading: "perNode" | "worldSize"): number {
  const geo = computeGeometryFromAttrs(model.displayAs, model.attrs);
  if (!geo) throw new Error(`no geometry for "${model.displayAs}"`);
  const screen = screenFromAttrs(model.displayAs, model.attrs, geo, SPACING, reading);
  return transformedHalfExtents(geo, { scale: screen.scale, scaleY: screen.scaleY, rotateDeg: screen.rotate }).halfW * 2 * SPACING;
}

// Models whose size comes from data that is unambiguously in world units - the same in either
// reading, which is what makes them usable as a yardstick.
const ROOFLINE: PlaceableModel = {
  displayAs: "Single Line",
  attrs: { NumStrings: "1", NodesPerString: "60", WorldPosX: "180", WorldPosY: "360", X2: "480", Y2: "0" },
};
const ARCHES: PlaceableModel = {
  displayAs: "Arches",
  attrs: { NumArches: "5", NodesPerArch: "20", WorldPosX: "200", WorldPosY: "90", X2: "330", Y2: "0", Height: "0.28" },
};

// The same 32x32 matrix, written by each convention so that it is ~90 world units across -
// about a fifth of the roofline, which is what a real P5 panel next to a roofline looks like.
const MATRIX_PER_NODE: PlaceableModel = {
  displayAs: "Matrix",
  attrs: { NumStrings: "32", NodesPerString: "32", WorldPosX: "120", WorldPosY: "160", ScaleX: "2.9", ScaleY: "2.9" },
};
const MATRIX_WORLD_SIZE: PlaceableModel = {
  displayAs: "Matrix",
  attrs: { NumStrings: "32", NodesPerString: "32", WorldPosX: "120", WorldPosY: "160", ScaleX: "90", ScaleY: "90" },
};

describe("the two readings of a boxed ScaleX", () => {
  it("differ by the model's node count, which is why the choice matters", () => {
    const perNode = widthOf(MATRIX_WORLD_SIZE, "perNode");
    const worldSize = widthOf(MATRIX_WORLD_SIZE, "worldSize");
    expect(perNode / worldSize).toBeCloseTo(31, 0); // 32 nodes wide == 31 gaps
  });

  it("worldSize makes ScaleX the model's world width outright", () => {
    expect(widthOf(MATRIX_WORLD_SIZE, "worldSize")).toBeCloseTo(90, 4);
  });

  it("perNode makes ScaleX a per-node multiplier", () => {
    expect(widthOf(MATRIX_PER_NODE, "perNode")).toBeCloseTo(2.9 * 31, 4);
  });

  it("neither reading touches a model sized by its endpoints", () => {
    expect(widthOf(ROOFLINE, "perNode")).toBeCloseTo(widthOf(ROOFLINE, "worldSize"), 6);
    expect(widthOf(ROOFLINE, "perNode")).toBeCloseTo(480, 4);
  });
});

describe("choosing the reading from evidence in the file", () => {
  it("picks worldSize for a show whose boxed models are written that way", () => {
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES, MATRIX_WORLD_SIZE], SPACING);
    expect(choice.reading).toBe("worldSize");
    expect(choice.decided).toBe(true);
    expect(choice.referenceCount).toBe(2);
    expect(choice.boxedCount).toBe(1);
  });

  it("picks perNode for a show whose boxed models are written that way", () => {
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES, MATRIX_PER_NODE], SPACING);
    expect(choice.reading).toBe("perNode");
    expect(choice.decided).toBe(true);
  });

  it("is not swayed by one outsized prop", () => {
    // A single huge matrix among sanely-written models must not flip the whole show - hence
    // medians rather than means on both sides.
    const giant: PlaceableModel = {
      displayAs: "Matrix",
      attrs: { NumStrings: "64", NodesPerString: "64", ScaleX: "900", ScaleY: "900" },
    };
    const wreath: PlaceableModel = {
      displayAs: "Wreath",
      attrs: { NumStrings: "1", NodesPerString: "40", ScaleX: "60", ScaleY: "60" },
    };
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES, MATRIX_WORLD_SIZE, wreath, giant], SPACING);
    expect(choice.reading).toBe("worldSize");
  });

  it("keeps the existing reading when there is nothing to measure against", () => {
    // No endpoint-placed model means no yardstick. Inventing one would be worse than leaving
    // the show alone, so this reports decided:false and changes nothing.
    const choice = chooseBoxedScaleReading([MATRIX_WORLD_SIZE], SPACING);
    expect(choice.decided).toBe(false);
    expect(choice.reading).toBe("perNode");
  });

  it("keeps the existing reading for a show with no boxed models at all", () => {
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES], SPACING);
    expect(choice.decided).toBe(false);
  });

  it("ignores models it can't build geometry for", () => {
    const unsupported: PlaceableModel = { displayAs: "Sphere", attrs: { ScaleX: "5" } };
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES, MATRIX_WORLD_SIZE, unsupported], SPACING);
    expect(choice.reading).toBe("worldSize");
    expect(choice.boxedCount).toBe(1);
  });

  // The test that actually rescued a real import: a whole yard's worth of models where the
  // median comparison alone picked the wrong reading, because the two readings differ by each
  // model's own node count rather than by a constant, so the medians don't move together.
  it("rejects a reading that makes a prop bigger than the entire yard", () => {
    const yard: PlaceableModel[] = [
      ROOFLINE,
      ARCHES,
      // Written as world sizes, in a yard about 900 units across.
      { displayAs: "Matrix", attrs: { NumStrings: "32", NodesPerString: "32", WorldPosX: "120", WorldPosY: "160", ScaleX: "90", ScaleY: "90" } },
      { displayAs: "Wreath", attrs: { NumStrings: "1", NodesPerString: "40", WorldPosX: "830", WorldPosY: "230", ScaleX: "60", ScaleY: "60" } },
      { displayAs: "Window Frame", attrs: { TopNodes: "14", SideNodes: "10", BottomNodes: "14", WorldPosX: "300", WorldPosY: "270", ScaleX: "14", ScaleY: "10" } },
      { displayAs: "Tree", attrs: { NumStrings: "16", NodesPerString: "50", WorldPosX: "1050", WorldPosY: "150", ScaleX: "180", ScaleY: "230" } },
    ];
    const choice = chooseBoxedScaleReading(yard, SPACING);
    expect(choice.reading).toBe("worldSize");
    expect(choice.reason).toBe("impossible-size");
    // Under the other reading the widest prop is several times the whole layout.
    expect(choice.widthByReading.perNode).toBeGreaterThan(choice.yardSpan / 2);
  });

  it("reports what it measured, so a wrong call is diagnosable rather than mysterious", () => {
    const choice = chooseBoxedScaleReading([ROOFLINE, ARCHES, MATRIX_WORLD_SIZE], SPACING);
    expect(choice.referenceMedian).toBeGreaterThan(0);
    expect(choice.widthByReading.worldSize).toBeCloseTo(90, 4);
    expect(choice.widthByReading.perNode).toBeGreaterThan(choice.widthByReading.worldSize * 20);
  });
});

import { describe, expect, it } from "vitest";
import { displayY, standsOnGround, transformForModel } from "../src/lib/modelTransform";
import type { ModelRecord } from "../src/lib/api";

const model = (over: Partial<ModelRecord> = {}): ModelRecord =>
  ({
    id: 1,
    name: "m",
    type: "Tree",
    supported: true,
    raw_attrs: {},
    screen: { scale: 2, scaleY: 3, scaleZ: 4, rotate: 180, rotateX: 10, rotateY: 20 },
    ...over,
  }) as ModelRecord;

describe("planting a model on the ground", () => {
  it("puts a tree's base on the lawn whatever its record says", () => {
    // The stored position is the model's centre, so how high it belongs depends on how tall we
    // work the model out to be - and a tree's height changed when strand folding landed, which
    // left every one of them hanging in the air.
    const tree = model({ screen: { y: 900 } as ModelRecord["screen"] });
    expect(displayY(tree, 40, 0, true)).toBe(40);
    expect(displayY(tree, 40, -100, true)).toBe(-60);
  });

  it("leaves everything else where it was put", () => {
    // A star on a roof peak and lights along a gutter are up there on purpose.
    const star = model({ type: "Star", screen: { y: 900 } as ModelRecord["screen"] });
    expect(displayY(star, 40, 0, true)).toBe(900);
  });

  it("gives a tree its record back when the rule is turned off", () => {
    expect(displayY(model({ screen: { y: 900 } as ModelRecord["screen"] }), 40, 0, false)).toBe(900);
  });

  it("knows a tree by what the file calls it", () => {
    const named = model({ type: "Tree", raw_attrs: { DisplayAs: "Tree 360" }, screen: { y: 900 } as ModelRecord["screen"] });
    expect(standsOnGround(named)).toBe(true);
    expect(standsOnGround(model({ type: "Matrix", raw_attrs: {} }))).toBe(false);
  });
});

describe("a model's screen transform", () => {
  it("drops a Z rotation on a tree, which can only tip it over", () => {
    // The one thing left that could stand a mega tree on its head once the geometry is upright
    // and the scales are magnitudes. Spinning a tree usefully is RotateY, about its own axis.
    expect(transformForModel(model()).rotateDeg).toBe(0);
  });

  it("keeps a Z rotation on everything else", () => {
    expect(transformForModel(model({ type: "Custom" })).rotateDeg).toBe(180);
    expect(transformForModel(model({ type: "Matrix" })).rotateDeg).toBe(180);
  });

  it("recognises a tree by what the file actually calls it", () => {
    // Real files say "Tree 360", not "Tree" - and the raw attribute is where the original
    // survives after the importer has normalised the type.
    const named = model({ type: "Tree", raw_attrs: { DisplayAs: "Tree 270" } });
    expect(transformForModel(named).rotateDeg).toBe(0);
  });

  it("passes the rest through untouched", () => {
    const t = transformForModel(model({ type: "Custom" }));
    expect(t.scale).toBe(2);
    expect(t.scaleY).toBe(3);
    expect(t.scaleZ).toBe(4);
    expect(t.rotateXDeg).toBe(10);
    expect(t.rotateYDeg).toBe(20);
  });

  it("is the same answer for both views, because there is only one of it", () => {
    // The layout canvas and the house preview built their own and had already drifted apart -
    // one was passing no depth scale and no X/Y rotation while the other passed both.
    expect(transformForModel(model())).toEqual(transformForModel(model()));
  });
});

describe("every axis is available to every model", () => {
  it("carries all three rotations and all three scales through", () => {
    // The panel only exposed Scale X, Scale Y and one rotation, so a model that needed tipping
    // on X - a stake, a cube laid flat - had no way to say so.
    const t = transformForModel(
      model({
        type: "Cube",
        screen: { scale: 2, scaleY: 3, scaleZ: 4, rotate: 10, rotateX: 90, rotateY: 45 } as ModelRecord["screen"],
      }),
    );
    expect(t).toEqual({ scale: 2, scaleY: 3, scaleZ: 4, rotateDeg: 10, rotateXDeg: 90, rotateYDeg: 45 });
  });

  it("treats a missing rotation as none rather than as undefined", () => {
    const t = transformForModel(model({ type: "Cube", screen: { scale: 1 } as ModelRecord["screen"] }));
    expect(t.rotateXDeg).toBe(0);
    expect(t.rotateYDeg).toBe(0);
    expect(t.rotateDeg).toBe(0);
  });
});

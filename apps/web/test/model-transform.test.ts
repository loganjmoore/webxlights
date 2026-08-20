import { describe, expect, it } from "vitest";
import { transformForModel } from "../src/lib/modelTransform";
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

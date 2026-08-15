import { describe, expect, it } from "vitest";
import type { SequenceEffect } from "../src/lib/api";
import { addLayer, canAddLayer, effectsOnLayer, layerCount, layerOf, removeLayer } from "../src/lib/effectLayers";

function effect(id: string, layerIndex?: number): SequenceEffect {
  return { id, name: "On", startMs: 0, endMs: 500, params: {}, ...(layerIndex === undefined ? {} : { layerIndex }) };
}

describe("which layer an effect is on", () => {
  it("is the bottom one when unset", () => {
    // Every sequence written before layers existed reads as a single-layer one, which is what it is.
    expect(layerOf(effect("a"))).toBe(0);
    expect(layerOf(effect("b", 3))).toBe(3);
  });
});

describe("how many layers a row shows", () => {
  it("is one for an empty row", () => {
    expect(layerCount([])).toBe(1);
  });

  it("is enough to show the highest layer in use", () => {
    expect(layerCount([effect("a"), effect("b", 2)])).toBe(3);
  });

  it("keeps the empty layers in between", () => {
    // The gap is real: those layers exist and are empty, and hiding them would renumber
    // everything the moment one was filled.
    expect(layerCount([effect("a", 5)])).toBe(6);
  });
});

describe("adding a layer", () => {
  const effects = [effect("bottom", 0), effect("middle", 1), effect("top", 2)];

  it("above pushes everything from that layer up, and leaves it free", () => {
    // "Above" is a higher index: the stack composites bottom-up, so a higher number sits nearer
    // the viewer.
    const { moves, newLayerIndex } = addLayer(effects, 0, "above");
    expect(newLayerIndex).toBe(1);
    expect(moves).toEqual([
      { id: "middle", layerIndex: 2 },
      { id: "top", layerIndex: 3 },
    ]);
  });

  it("below pushes the current layer up too", () => {
    const { moves, newLayerIndex } = addLayer(effects, 1, "below");
    expect(newLayerIndex).toBe(1);
    expect(moves).toEqual([
      { id: "middle", layerIndex: 2 },
      { id: "top", layerIndex: 3 },
    ]);
  });

  it("moves nothing when added above the top", () => {
    const { moves, newLayerIndex } = addLayer(effects, 2, "above");
    expect(moves).toEqual([]);
    expect(newLayerIndex).toBe(3);
  });

  it("treats effects with no layer set as layer 0", () => {
    const { moves } = addLayer([effect("old")], 0, "below");
    expect(moves).toEqual([{ id: "old", layerIndex: 1 }]);
  });
});

describe("removing a layer", () => {
  const effects = [effect("bottom", 0), effect("middle", 1), effect("top", 2)];

  it("says what it would delete as well as what moves", () => {
    // Deleting a layer that still has effects on it silently would lose work, so the caller is
    // told which they are rather than only which moved.
    const { deleted, moves } = removeLayer(effects, 1);
    expect(deleted).toEqual(["middle"]);
    expect(moves).toEqual([{ id: "top", layerIndex: 1 }]);
  });

  it("deletes nothing from an empty layer", () => {
    expect(removeLayer(effects, 5).deleted).toEqual([]);
  });
});

describe("the effects on one layer", () => {
  it("are only that layer's", () => {
    const effects = [effect("a"), effect("b", 1), effect("c", 1)];
    expect(effectsOnLayer(effects, 1).map((e) => e.id)).toEqual(["b", "c"]);
    expect(effectsOnLayer(effects, 0).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("the cap", () => {
  it("is the manual's 200", () => {
    expect(canAddLayer([effect("a")])).toBe(true);
    expect(canAddLayer([effect("a", 198)])).toBe(true);
    // A row at 200 layers that silently ignored the menu item would look broken rather than full.
    expect(canAddLayer([effect("a", 199)])).toBe(false);
  });
});

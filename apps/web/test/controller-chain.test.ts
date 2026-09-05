import { describe, expect, it } from "vitest";
import type { ModelRecord } from "../src/lib/api";
import { applyChainPatches, chainOn, placeInChain, removeFromChain } from "../src/lib/controllerChain";

function model(id: number, name: string, controller: number | null, offset: number | null, count: number | null = null): ModelRecord {
  return { id, name, type: "Matrix", supported: true, controller_id: controller, controller_offset: offset, channel_count: count } as unknown as ModelRecord;
}
const count = (m: ModelRecord) => ({ 1: 30, 2: 60, 3: 90, 4: 12 })[m.id] ?? 3;

describe("chaining models on a controller", () => {
  const models = [model(1, "Arch", 7, 0, 30), model(2, "Tree", 7, 30, 60), model(3, "Star", null, null), model(4, "Roof", 8, 0, 12)];

  it("lists a controller's models in channel order", () => {
    expect(chainOn(models, 7).map((m) => m.name)).toEqual(["Arch", "Tree"]);
  });

  it("drops an unassigned model on the end of a chain", () => {
    expect(placeInChain(models, 3, 7, undefined, count)).toEqual([
      { modelId: 3, controller_id: 7, controller_offset: 90, channel_count: 90 },
    ]);
  });

  it("inserts between two models and shuffles the rest along", () => {
    expect(placeInChain(models, 3, 7, 1, count)).toEqual([
      { modelId: 3, controller_id: 7, controller_offset: 30, channel_count: 90 },
      { modelId: 2, controller_id: 7, controller_offset: 120, channel_count: 60 },
    ]);
  });

  it("moves a model between controllers and closes the gap it left", () => {
    const patches = placeInChain(models, 1, 8, undefined, count);
    expect(patches).toEqual([
      { modelId: 1, controller_id: 8, controller_offset: 12, channel_count: 30 },
      { modelId: 2, controller_id: 7, controller_offset: 0, channel_count: 60 },
    ]);
    const after = applyChainPatches(models, patches);
    expect(chainOn(after, 8).map((m) => m.name)).toEqual(["Roof", "Arch"]);
    expect(chainOn(after, 7).map((m) => m.name)).toEqual(["Tree"]);
  });

  it("reordering within a chain writes only what moved", () => {
    // Tree to the front of controller 7: both swap; Arch's offset changes too.
    expect(placeInChain(models, 2, 7, 0, count)).toEqual([
      { modelId: 2, controller_id: 7, controller_offset: 0, channel_count: 60 },
      { modelId: 1, controller_id: 7, controller_offset: 60, channel_count: 30 },
    ]);
    // Dropping a model back where it already is costs nothing.
    expect(placeInChain(models, 2, 7, 1, count)).toEqual([]);
  });

  it("taking a model off a controller closes the gap", () => {
    expect(removeFromChain(models, 1, count)).toEqual([
      { modelId: 1, controller_id: null, controller_offset: null, channel_count: null },
      { modelId: 2, controller_id: 7, controller_offset: 0, channel_count: 60 },
    ]);
    expect(removeFromChain(models, 3, count)).toEqual([]);
  });
});

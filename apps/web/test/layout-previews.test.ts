import { describe, expect, it } from "vitest";
import {
  ALL_MODELS,
  DEFAULT_PREVIEW,
  UNASSIGNED,
  effectivePreview,
  modelsInPreview,
  previewNames,
  previewOf,
} from "../src/lib/layoutPreviews";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";

let nextId = 1;
function model(name: string, preview?: string): ModelRecord {
  return {
    id: nextId++,
    name,
    type: "Matrix",
    supported: true,
    params: {},
    raw_attrs: preview ? { Preview: preview } : {},
    screen: {},
  } as ModelRecord;
}

function group(name: string, members: ModelRecord[], preview?: string): ModelGroupRecord {
  return {
    id: nextId++,
    name,
    buffer_style: "Default",
    members: members.map((m) => ({ id: m.id, name: m.name })),
    params: preview ? { Preview: preview } : {},
  };
}

describe("which preview a model is in", () => {
  it("reads the model's own attribute", () => {
    expect(previewOf(model("Tree", "Front Yard"))).toBe("Front Yard");
    expect(previewOf(model("Tree"))).toBe("");
  });

  it("falls back to a group's, so a whole section moves in one edit", () => {
    const tree = model("Tree");
    expect(effectivePreview(tree, [group("Roof", [tree], "Roofline")])).toBe("Roofline");
  });

  it("lets the model's own attribute win over its group's", () => {
    const tree = model("Tree", "Mine");
    expect(effectivePreview(tree, [group("Roof", [tree], "Theirs")])).toBe("Mine");
  });

  it("ignores a group the model isn't in", () => {
    const tree = model("Tree");
    const other = model("Arch");
    expect(effectivePreview(tree, [group("Roof", [other], "Roofline")])).toBe("");
  });
});

describe("the list of previews", () => {
  it("always offers the three built-ins", () => {
    const names = previewNames([model("Tree")], []);
    expect(names[0]).toBe(ALL_MODELS);
    expect(names).toContain(DEFAULT_PREVIEW);
    expect(names[names.length - 1]).toBe(UNASSIGNED);
  });

  it("takes the named ones from the models themselves", () => {
    // Not from a stored list: a preview with no models has nothing to show, and one that existed
    // only in a list would linger after the last model left it.
    const names = previewNames([model("A", "Back Yard"), model("B", "Front Yard")], []);
    expect(names).toEqual([ALL_MODELS, DEFAULT_PREVIEW, "Back Yard", "Front Yard", UNASSIGNED]);
  });

  it("lists a preview a group put its members in", () => {
    const tree = model("Tree");
    expect(previewNames([tree], [group("Roof", [tree], "Roofline")])).toContain("Roofline");
  });

  it("doesn't list Default twice when models name it", () => {
    expect(previewNames([model("A", DEFAULT_PREVIEW)], []).filter((n) => n === DEFAULT_PREVIEW)).toHaveLength(1);
  });
});

describe("what a preview shows", () => {
  const front = model("Front", "Front Yard");
  const back = model("Back", "Back Yard");
  const loose = model("Loose");
  const models = [front, back, loose];

  it("shows everything for All Models", () => {
    expect(modelsInPreview(models, [], ALL_MODELS)).toHaveLength(3);
  });

  it("shows only its own for a named preview", () => {
    expect(modelsInPreview(models, [], "Front Yard").map((m) => m.name)).toEqual(["Front"]);
  });

  it("shows the ones no preview claims for Unassigned", () => {
    // Which is what makes a model that was missed findable rather than invisible.
    expect(modelsInPreview(models, [], UNASSIGNED).map((m) => m.name)).toEqual(["Loose"]);
  });

  it("counts a group's preview when deciding what's unassigned", () => {
    expect(modelsInPreview(models, [group("G", [loose], "Roofline")], UNASSIGNED)).toEqual([]);
  });
});

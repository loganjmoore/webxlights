import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRgbEffectsXml } from "@webxlights/formats";
import { ROLES, ROLE_NAMES, propMap, roleOf } from "../src/lib/propRoles";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
// @ts-expect-error - a plain .mjs tool with no type declarations
import { ROLES as CORPUS_ROLES } from "../../../tools/sequence-corpus/roles.mjs";

const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };

/** The formats package's sample layout, as the app would store it after an import. */
function sampleLayout(): { models: ModelRecord[]; groups: ModelGroupRecord[] } {
  const xml = readFileSync(fileURLToPath(new URL("../../../packages/formats/test/fixtures/sample-rgbeffects.xml", import.meta.url)), "utf-8");
  const parsed = parseRgbEffectsXml(xml);
  const models = parsed.models.map((m, i) => ({ id: i + 1, name: m.name, type: m.displayAs, supported: m.supported, params: {}, raw_attrs: m.attrs, screen: { x: i * 100, y: 0 } }) as unknown as ModelRecord);
  const groups = parsed.groups.map((g, i) => ({
    id: 100 + i, name: g.name, buffer_style: "Default",
    members: g.members.map((name) => models.find((m) => m.name === name)).filter((m) => !!m).map((m) => ({ id: m!.id, name: m!.name })),
  }) as ModelGroupRecord);
  return { models, groups };
}

describe("trees by size", () => {
  const tree = (id: number, name: string, strings: number, perString: number): ModelRecord => ({
    id, name, type: "Tree 360", supported: true, params: {}, screen: { x: id * 100, y: 0 },
    raw_attrs: { DisplayAs: "Tree 360", StringType: "RGB Nodes", NumStrings: String(strings), NodesPerString: String(perString) },
  }) as unknown as ModelRecord;

  it("makes the big trees mega trees and the small ones mini trees when the names don't say", () => {
    // The real layout this came from: two 6,400-node trees called "Seed Tree" and "Tree", and
    // bare-named 150-node trees.
    const models = [tree(1, "Seed Tree", 64, 100), tree(2, "Tree", 64, 100), tree(3, "MTL1", 6, 25), tree(4, "PTR2", 6, 25), tree(5, "MTL3", 6, 25)];
    const roles = Object.fromEntries(propMap(models, []).map((p) => [p.name, [p.role, p.tier]]));
    expect(roles["Seed Tree"]).toEqual(["mega_tree", "hero"]);
    expect(roles["Tree"]).toEqual(["mega_tree", "hero"]);
    for (const name of ["MTL1", "PTR2", "MTL3"]) expect(roles[name], name).toEqual(["mini_tree", "feature"]);
  });

  it("leaves a tree its name calls mini or mega, and one the user set, alone", () => {
    const models = [tree(1, "Mini Tree 9", 64, 100), tree(2, "Mega Tree", 4, 25), { ...tree(3, "T3", 4, 25), params: { magicRole: "mega_tree" } }];
    const roles = Object.fromEntries(propMap(models, []).map((p) => [p.name, p.role]));
    expect(roles).toEqual({ "Mini Tree 9": "mini_tree", "Mega Tree": "mega_tree", T3: "mega_tree" });
    // And the test layout reads as before: one mega tree, four minis.
    const fixture = propMap(layout.models, layout.groups).filter((p) => p.key.startsWith("model:") && p.role.endsWith("_tree"));
    expect(fixture.map((p) => p.role).sort()).toEqual(["mega_tree", "mini_tree", "mini_tree", "mini_tree", "mini_tree"]);
  });
});

describe("prop roles", () => {
  it("uses exactly the classifier the corpus priors were measured with", () => {
    expect(ROLES.map(([role, re]) => [role, re.source, re.flags])).toEqual((CORPUS_ROLES as [string, RegExp][]).map(([role, re]) => [role, re.source, re.flags]));
  });

  it("reads names first and DisplayAs when the name says nothing", () => {
    expect(roleOf("Boscoyo ChromaFlake 24 3 prong", "Custom")).toBe("snowflake");
    expect(roleOf("tree3", "Tree 180")).toBe("mini_tree");
    expect(roleOf("Prop 7", "Arches")).toBe("arch");
    expect(roleOf("Prop 8", "Horiz Matrix")).toBe("matrix");
    expect(roleOf("bundle_col8_row3", "Custom")).toBe("other");
  });

  it("covers every role in the synthetic layout, with the expected tiers", () => {
    const props = propMap(layout.models, layout.groups);
    expect(new Set(props.map((p) => p.role))).toEqual(new Set(ROLE_NAMES));
    const byName = (name: string) => props.find((p) => p.name === name)!;
    expect(byName("Mega Tree")).toMatchObject({ role: "mega_tree", tier: "hero", dims: 2, nodes: 1600 });
    expect(byName("Matrix")).toMatchObject({ role: "matrix", tier: "hero", dims: 2 });
    expect(byName("Singing Face")).toMatchObject({ role: "singing_face", tier: "hero" });
    expect(byName("Arch 1")).toMatchObject({ role: "arch", tier: "feature", dims: 1, side: "left" });
    expect(byName("Arch 4")).toMatchObject({ side: "right" });
    expect(byName("Roofline Left")).toMatchObject({ role: "outline", tier: "frame", dims: 1 });
    expect(byName("Flood 1")).toMatchObject({ role: "flood", tier: "fill", nodes: 1 });
    expect(byName("Prop 17")).toMatchObject({ role: "other" });
  });

  it("gives a group the role most of its members have, and a mixed group the whole house", () => {
    const props = propMap(layout.models, layout.groups);
    const group = (name: string) => props.find((p) => p.key.startsWith("group:") && p.name === name)!;
    expect(group("All Arches")).toMatchObject({ role: "arch", members: ["model:13", "model:14", "model:15", "model:16"] });
    expect(group("Mini Trees").role).toBe("mini_tree");
    expect(group("Whole House")).toMatchObject({ role: "whole_house", tier: "fill" });
    // Majority beats the name: "Everything but the star" that is all arches is arches.
    const arches = layout.models.filter((m) => m.name.startsWith("Arch")).map((m) => ({ id: m.id, name: m.name }));
    const misleading = propMap(layout.models, [{ id: 1, name: "EVERYTHING", buffer_style: "Default", members: arches }]);
    expect(misleading.find((p) => p.key === "group:1")!.role).toBe("arch");
    // But a group of nearly every prop is the whole house, even on a yard that is mostly arches.
    const yard = [...layout.models.filter((m) => !m.name.startsWith("Arch")).slice(0, 4), ...Array.from({ length: 12 }, (_, i) => ({ ...layout.models.find((m) => m.name === "Arch 1")!, id: 500 + i, name: `Arch ${10 + i}` }))];
    const all = propMap(yard, [{ id: 2, name: "Magic: Whole house", buffer_style: "Default", members: yard.map((m) => ({ id: m.id, name: m.name })) }]);
    expect(all.find((p) => p.key === "group:2")!.role).toBe("whole_house");
  });

  it("lets the user's role correction win", () => {
    const models = layout.models.map((m) => (m.name === "Prop 17" ? { ...m, params: { magicRole: "star" } } : m));
    expect(propMap(models, []).find((p) => p.name === "Prop 17")).toMatchObject({ role: "star", tier: "feature", override: true });
    // An unknown role is ignored rather than trusted.
    const bad = layout.models.map((m) => (m.name === "Prop 17" ? { ...m, params: { magicRole: "spaceship" } } : m));
    expect(propMap(bad, []).find((p) => p.name === "Prop 17")!.role).toBe("other");
  });

  it("reads a dense Custom model as a matrix and makes a node-count outlier a hero", () => {
    const grid = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => String(y * 20 + x + 1)).join(",")).join(";");
    const dense = { id: 900, name: "Bundle 7", type: "Custom", supported: true, params: {}, raw_attrs: { DisplayAs: "Custom", CustomModel: grid }, screen: { x: 0, y: 0 } } as unknown as ModelRecord;
    expect(propMap([...layout.models, dense], []).find((p) => p.name === "Bundle 7")).toMatchObject({ role: "matrix", nodes: 400 });

    const huge = { id: 901, name: "Garage Outline", type: "Single Line", supported: true, params: {}, raw_attrs: { DisplayAs: "Single Line", NumStrings: "1", NodesPerString: "5000" }, screen: { x: 0, y: 0 } } as unknown as ModelRecord;
    expect(propMap([...layout.models, huge], []).find((p) => p.name === "Garage Outline")).toMatchObject({ role: "window", tier: "hero" });
  });

  it("classifies the formats sample layout", () => {
    const { models, groups } = sampleLayout();
    const props = propMap(models, groups);
    const role = (name: string) => props.find((p) => p.name === name)?.role;
    expect(role("Mega Tree")).toBe("mega_tree");
    expect(role("Arch 1")).toBe("arch");
    expect(role("Porch Roofline")).toBe("outline");
    expect(role("Spinner Prop")).toBe("spinner");
    expect(props.find((p) => p.key.startsWith("group:") && p.name === "ALL")!.role).toBe("whole_house");
    expect(props.find((p) => p.key.startsWith("group:") && p.name === "Front Yard")!.members).toHaveLength(2);
  });
});

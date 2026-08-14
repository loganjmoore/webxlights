import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRgbEffectsXml } from "../src/rgbeffects";

const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/sample-rgbeffects.xml", import.meta.url)),
  "utf-8",
);

describe("parseRgbEffectsXml", () => {
  it("parses all models with their raw attribute bag", () => {
    const result = parseRgbEffectsXml(fixture);
    expect(result.models).toHaveLength(4);
    const tree = result.models.find((m) => m.name === "Mega Tree")!;
    expect(tree.displayAs).toBe("Tree");
    expect(tree.attrs.NumStrings).toBe("16");
    expect(tree.attrs.NodesPerString).toBe("50");
  });

  it("flags supported vs unsupported DisplayAs types", () => {
    const result = parseRgbEffectsXml(fixture);
    const supported = result.models.filter((m) => m.supported).map((m) => m.name);
    expect(supported).toEqual(["Mega Tree", "Arch 1", "Porch Roofline"]);
    expect(result.unsupportedTypes).toEqual(["Spinner"]);
  });

  it("parses model groups with member lists", () => {
    const result = parseRgbEffectsXml(fixture);
    expect(result.groups).toHaveLength(2);
    const all = result.groups.find((g) => g.name === "ALL")!;
    expect(all.members).toEqual(["Mega Tree", "Arch 1", "Porch Roofline", "Spinner Prop"]);
  });

  it("throws on a non-rgbeffects file", () => {
    expect(() => parseRgbEffectsXml("<foo/>")).toThrow();
  });

  it("normalizes legacy DisplayAs style-variant strings to their canonical type", () => {
    // Real xLights writes these on disk (confirmed via a real user show) and normalizes them
    // itself on load - a naive exact-match against "Tree"/"Matrix" wrongly treats a real show's
    // most common model style as unsupported.
    const xml = `<xrgb><models>
      <model name="Tree360" DisplayAs="Tree 360" NumStrings="16"/>
      <model name="HMatrix" DisplayAs="Horiz Matrix" NumStrings="8"/>
      <model name="VMatrix" DisplayAs="Vert Matrix" NumStrings="8"/>
    </models></xrgb>`;
    const result = parseRgbEffectsXml(xml);
    expect(result.models.map((m) => [m.displayAs, m.supported])).toEqual([
      ["Tree", true],
      ["Matrix", true],
      ["Matrix", true],
    ]);
    expect(result.unsupportedTypes).toEqual([]);
  });

  it("parses view_objects separately from models, flagging Gridlines as the only supported type", () => {
    // Real xLights writes these under <view_objects>, not <models> - a distinct element that
    // was previously not parsed at all, silently dropping every real show's Gridlines/Mesh.
    const xml = `<xrgb><models></models><view_objects>
      <view_object name="Gridlines" DisplayAs="Gridlines" GridLineSpacing="50" GridWidth="2500" GridHeight="2000"/>
      <view_object name="Mesh" DisplayAs="Mesh" ObjFile="/path/house.obj"/>
    </view_objects></xrgb>`;
    const result = parseRgbEffectsXml(xml);
    expect(result.viewObjects).toHaveLength(2);
    expect(result.viewObjects.map((o) => [o.name, o.displayAs, o.supported])).toEqual([
      ["Gridlines", "Gridlines", true],
      ["Mesh", "Mesh", false],
    ]);
    expect(result.viewObjects[0]!.attrs.GridLineSpacing).toBe("50");
    expect(result.unsupportedTypes).toEqual(["Mesh"]);
  });
});

// xLights stores SubModels as <subModel> elements nested inside <model>, not as attributes, so
// the lossless raw-attribute bag never carried them and every sub-model row in an imported
// sequence had nowhere to land.
describe("SubModels", () => {
  const xml = `<?xml version="1.0"?>
<xrgb>
  <models>
    <model name="Mega Tree" DisplayAs="Tree 360" parm1="16" parm2="50">
      <subModel name="Star" layout="horizontal" type="ranges" line0="1-10" />
      <subModel name="Trunk" layout="vertical" line0="20-25" line1="26-31" />
      <subModel name="TopHalf" type="subbuffer" subBuffer="0,50,100,100" />
      <subModel name="Empty" line0="" />
    </model>
    <model name="Arch" DisplayAs="Arches" parm1="1" parm2="20" />
  </models>
</xrgb>`;

  it("reads each sub-model's rows from its numbered line attributes", () => {
    const parsed = parseRgbEffectsXml(xml);
    const tree = parsed.models.find((m) => m.name === "Mega Tree")!;
    const star = tree.subModels.find((s) => s.name === "Star")!;
    expect(star.rows).toEqual(["1-10"]);
    expect(star.type).toBe("ranges");

    const trunk = tree.subModels.find((s) => s.name === "Trunk")!;
    expect(trunk.rows).toEqual(["20-25", "26-31"]);
    expect(trunk.vertical).toBe(true);
  });

  it("reads a sub-buffer sub-model", () => {
    const tree = parseRgbEffectsXml(xml).models.find((m) => m.name === "Mega Tree")!;
    const half = tree.subModels.find((s) => s.name === "TopHalf")!;
    expect(half.type).toBe("subbuffer");
    expect(half.subBuffer).toBe("0,50,100,100");
  });

  it("skips a sub-model with no nodes rather than importing an empty row", () => {
    const tree = parseRgbEffectsXml(xml).models.find((m) => m.name === "Mega Tree")!;
    expect(tree.subModels.map((s) => s.name)).not.toContain("Empty");
  });

  it("gives a model with no sub-models an empty list, not undefined", () => {
    const arch = parseRgbEffectsXml(xml).models.find((m) => m.name === "Arch")!;
    expect(arch.subModels).toEqual([]);
  });
});

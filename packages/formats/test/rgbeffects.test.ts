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
    expect(result.models).toHaveLength(5);
    const tree = result.models.find((m) => m.name === "Mega Tree")!;
    expect(tree.displayAs).toBe("Tree");
    expect(tree.attrs.NumStrings).toBe("16");
    expect(tree.attrs.NodesPerString).toBe("50");
  });

  it("flags supported vs unsupported DisplayAs types", () => {
    const result = parseRgbEffectsXml(fixture);
    const supported = result.models.filter((m) => m.supported).map((m) => m.name);
    // Spinner used to be in this fixture as the unsupported one. It renders now, so the fixture
    // names a type that genuinely doesn't: a Label is a text annotation, not lights.
    expect(supported).toEqual(["Mega Tree", "Arch 1", "Porch Roofline", "Spinner Prop"]);
    expect(result.unsupportedTypes).toEqual(["Label"]);
  });

  it("parses model groups with member lists", () => {
    const result = parseRgbEffectsXml(fixture);
    expect(result.groups).toHaveLength(2);
    const all = result.groups.find((g) => g.name === "ALL")!;
    expect(all.members).toEqual(["Mega Tree", "Arch 1", "Porch Roofline", "Spinner Prop"]);
    // The `layout` attribute is the group's render style - how its members are arranged into the
    // one buffer an effect on the group draws into. It has to survive import: a group that lost
    // it would render with a different layout than the show was sequenced against.
    expect(all.layout).toBe("minimalGrid");
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

// States live inside <model> the same way, and are what the State effect turns on by name.
describe("States", () => {
  const xml = `<?xml version="1.0"?>
<xrgb>
  <models>
    <model name="Bruno" DisplayAs="Custom" parm1="10" parm2="4" CustomModel="1,2,3,4;5,6,7,8;9,10,11,12;13,14,15,16">
      <stateInfo Name="State1" Type="NodeRange" s2-Name="blink" s2="1,2,5,8" s1-Name="wink" s1="1,5,8" s1-Color="#FF0000" />
      <stateInfo Name="Empty" Type="NodeRange" s1-Name="nothing" />
    </model>
    <model name="Arch" DisplayAs="Arches" parm1="1" parm2="20" />
  </models>
</xrgb>`;

  it("reads a definition's states, in the order xLights numbered them", () => {
    const bruno = parseRgbEffectsXml(xml).models.find((m) => m.name === "Bruno")!;
    const state1 = bruno.states.find((s) => s.name === "State1")!;
    // s1 before s2, whatever order the attributes were written in - "Allocate" hands out colours
    // by this order, so it can't come from the file's attribute layout.
    expect(state1.entries.map((e) => e.name)).toEqual(["wink", "blink"]);
    expect(state1.entries[0]).toEqual({ name: "wink", nodes: "1,5,8", color: "#FF0000" });
    expect(state1.entries[1]!.color).toBeUndefined();
  });

  it("skips a definition whose states name no nodes", () => {
    const bruno = parseRgbEffectsXml(xml).models.find((m) => m.name === "Bruno")!;
    expect(bruno.states.map((s) => s.name)).not.toContain("Empty");
  });

  it("gives a model with no states an empty list, not undefined", () => {
    const arch = parseRgbEffectsXml(xml).models.find((m) => m.name === "Arch")!;
    expect(arch.states).toEqual([]);
  });
});

// Face definitions live inside <model> too, and two of their three types are node ranges.
describe("Faces", () => {
  const xml = `<?xml version="1.0"?>
<xrgb>
  <models>
    <model name="Singing Face" DisplayAs="Custom" parm1="10" parm2="4" CustomModel="1,2;3,4">
      <faceInfo Name="Face1" Type="NodeRange" mouth-AI="1-5" mouth-rest="6" mouth-MBP-Color="#00FF00" mouth-MBP="7-8" Eyes-Open="9" Eyes-Closed="10" Outline="11-20" />
      <faceInfo Name="Matrix Face" Type="Matrix" mouth-AI="C:/faces/ai.png" mouth-rest="C:/faces/rest.png" />
    </model>
    <model name="Arch" DisplayAs="Arches" parm1="1" parm2="20" />
  </models>
</xrgb>`;

  it("reads the mouths, the eyes and the outline of a node-range face", () => {
    const face = parseRgbEffectsXml(xml).models.find((m) => m.name === "Singing Face")!.faces[0]!;
    expect(face.name).toBe("Face1");
    expect(face.mouths.find((m) => m.name === "AI")!.nodes).toBe("1-5");
    expect(face.mouths.find((m) => m.name === "MBP")).toEqual({ name: "MBP", nodes: "7-8", color: "#00FF00" });
    expect(face.parts["Eyes-Open"]).toBe("9");
    expect(face.parts.Outline).toBe("11-20");
  });

  it("skips a Matrix face rather than reading its image paths as node ranges", () => {
    // A Matrix definition's values are file paths. Read as ranges they would light arbitrary
    // nodes instead of failing, which is the worst of the three outcomes.
    const faces = parseRgbEffectsXml(xml).models.find((m) => m.name === "Singing Face")!.faces;
    expect(faces).toHaveLength(1);
    expect(faces.map((f) => f.name)).not.toContain("Matrix Face");
  });

  it("gives a model with no faces an empty list, not undefined", () => {
    expect(parseRgbEffectsXml(xml).models.find((m) => m.name === "Arch")!.faces).toEqual([]);
  });
});

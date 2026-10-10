import { describe, expect, it } from "vitest";
import { parseRgbEffectsXml } from "@webxlights/formats";
import type { ModelRecord } from "../src/lib/api";
import { withImportedFaces } from "../src/lib/importedFaces";

// A singing tree as an xLights layout writes it, keys and all.
const xml = `<xrgb><models><model name="MTL1" DisplayAs="Tree 360" parm1="16" parm2="50">
  <faceInfo Name="Singing" Type="NodeRange" Mouth-AI="101-110" Mouth-MBP="111-115" Mouth-rest="116-118" Eyes-Open="201-210" Eyes-Closed="211-215" FaceOutline="300-340" />
</model></models></xrgb>`;
const parsed = parseRgbEffectsXml(xml).models[0]!;

function model(faces: ModelRecord["faces"]): ModelRecord {
  return { id: 1, name: "MTL1", type: "Tree", supported: true, params: {}, raw_attrs: parsed.attrs, screen: { x: 0, y: 0 }, faces } as unknown as ModelRecord;
}

describe("faces imported before the importer read xLights' keys", () => {
  it("get their mouths and outline back from the model's own faceInfo", () => {
    // What the old importer stored: the eyes, and no mouth or outline.
    const broken = model([{ name: "Singing", kind: "nodes", mouths: [], eyesOpen: "201-210", eyesClosed: "211-215" }]);
    const face = withImportedFaces(broken).faces![0]!;
    expect(face.mouths).toEqual([{ name: "AI", nodes: "101-110" }, { name: "MBP", nodes: "111-115" }, { name: "rest", nodes: "116-118" }]);
    expect(face.outline).toBe("300-340");
    expect(face.eyesOpen).toBe("201-210");
  });

  it("leave a face with a mouth exactly as it is, and a model without faceInfo alone", () => {
    const drawn = model([{ name: "Singing", kind: "nodes", mouths: [{ name: "AI", nodes: "1-2" }] }]);
    expect(withImportedFaces(drawn)).toBe(drawn);
    const plain = { ...model([{ name: "Singing", kind: "nodes", mouths: [] }]), raw_attrs: {} } as ModelRecord;
    expect(withImportedFaces(plain)).toBe(plain);
  });
});

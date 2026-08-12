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
});

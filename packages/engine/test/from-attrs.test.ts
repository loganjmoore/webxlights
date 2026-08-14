import { describe, expect, it } from "vitest";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";

// Mirrors packages/formats' sample-rgbeffects.xml fixture attributes — proves the
// import -> geometry pipeline end to end without a cross-package test dependency.
describe("computeGeometryFromAttrs (import pipeline)", () => {
  it("Tree: NumStrings x NodesPerString, TreeType 0 = Round", () => {
    const geo = computeGeometryFromAttrs("Tree", { NumStrings: "16", NodesPerString: "50", TreeType: "0" });
    expect(geo).not.toBeNull();
    expect(geo!.nodes.length).toBe(16 * 50);
  });

  it("Arches: NumArches x NodesPerArch", () => {
    const geo = computeGeometryFromAttrs("Arches", { NumArches: "5", NodesPerArch: "50", Arc: "180" });
    expect(geo!.nodes.length).toBe(5 * 50);
  });

  it("Single Line: NumStrings x NodesPerString", () => {
    const geo = computeGeometryFromAttrs("Single Line", { NumStrings: "1", NodesPerString: "120" });
    expect(geo!.nodes.length).toBe(120);
  });

  it("returns null for an unsupported DisplayAs", () => {
    // Label is a non-rendering annotation - "it does not control any lights or channels" - so
    // there is genuinely no geometry to build, and DmxServo is a fixture rather than pixels.
    expect(computeGeometryFromAttrs("Label", { Text: "Garage" })).toBeNull();
    expect(computeGeometryFromAttrs("DmxServo", {})).toBeNull();
  });

  it("falls back to sane defaults on missing attributes", () => {
    const geo = computeGeometryFromAttrs("Matrix", {});
    expect(geo!.nodes.length).toBeGreaterThan(0);
  });
});

// xLights renamed its generic parm1/parm2/parm3 model attributes to descriptive fields in the
// 2026.04 release, keeping the old names readable. Every show saved before that stores its
// counts under the old names - reading only the new ones meant silently importing every model
// at library defaults, which is why sizes were wrong for reasons no placement work could fix.
describe("legacy parm1/parm2/parm3 attribute names", () => {
  it("reads a matrix's counts from parm1/parm2", () => {
    const legacy = computeGeometryFromAttrs("Matrix", { parm1: "32", parm2: "100" });
    const current = computeGeometryFromAttrs("Matrix", { NumStrings: "32", NodesPerString: "100" });
    expect(legacy?.nodes.length).toBe(3200);
    expect(legacy?.nodes.length).toBe(current?.nodes.length);
    expect(legacy?.width).toBe(current?.width);
  });

  it("prefers the descriptive name when a file carries both", () => {
    const geo = computeGeometryFromAttrs("Matrix", { NumStrings: "8", NodesPerString: "10", parm1: "32", parm2: "100" });
    expect(geo?.nodes.length).toBe(80);
  });

  it("reads every type's counts, not just the matrix", () => {
    expect(computeGeometryFromAttrs("Tree", { parm1: "24", parm2: "60" })?.nodes.length).toBe(1440);
    expect(computeGeometryFromAttrs("Single Line", { parm1: "1", parm2: "75" })?.nodes.length).toBe(75);
    expect(computeGeometryFromAttrs("Arches", { parm1: "5", parm2: "20" })?.nodes.length).toBe(100);
    expect(computeGeometryFromAttrs("Candy Canes", { parm1: "6", parm2: "18" })?.nodes.length).toBe(108);
    expect(computeGeometryFromAttrs("Circle", { parm1: "1", parm2: "36" })?.nodes.length).toBe(36);
    expect(computeGeometryFromAttrs("Wreath", { parm1: "1", parm2: "44" })?.nodes.length).toBe(44);
    expect(computeGeometryFromAttrs("Icicles", { parm1: "1", parm2: "90" })?.nodes.length).toBe(90);
    expect(computeGeometryFromAttrs("Window Frame", { parm1: "20", parm2: "14", parm3: "20" })?.nodes.length).toBe(68);
  });

  it("takes a star's point count from parm3, the third field in xLights' own order", () => {
    const legacy = computeGeometryFromAttrs("Star", { parm1: "1", parm2: "50", parm3: "6" });
    const current = computeGeometryFromAttrs("Star", { NumStrings: "1", NodesPerString: "50", StarPoints: "6" });
    expect(legacy?.nodes.map((n) => [n.screenX, n.screenY])).toEqual(current?.nodes.map((n) => [n.screenX, n.screenY]));
  });

  it("still falls back to defaults when a model carries neither", () => {
    expect(computeGeometryFromAttrs("Matrix", {})?.nodes.length).toBe(800); // 16 x 50
  });
});

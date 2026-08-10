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

  it("returns null for an unsupported DisplayAs (e.g. Spinner)", () => {
    expect(computeGeometryFromAttrs("Spinner", { NumStrings: "4" })).toBeNull();
  });

  it("falls back to sane defaults on missing attributes", () => {
    const geo = computeGeometryFromAttrs("Matrix", {});
    expect(geo!.nodes.length).toBeGreaterThan(0);
  });
});

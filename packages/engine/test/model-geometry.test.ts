import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeSingleLine, computePolyLine } from "../src/models/line";
import { computeArches } from "../src/models/arches";
import { computeCandyCanes } from "../src/models/candyCanes";
import { computeCircle } from "../src/models/circle";
import { computeStar } from "../src/models/star";
import { computeTree } from "../src/models/tree";
import { computeIcicles } from "../src/models/icicles";
import { computeWindowFrame } from "../src/models/windowFrame";
import { computeWreath } from "../src/models/wreath";
import { parseCustomModelGrid } from "../src/models/custom";

// SPEC ch4 §4 node-count formulas, verified per model type (M1 acceptance).
describe("model node counts match SPEC formulas", () => {
  it("Matrix: strings x nodesPerString", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 16, nodesPerString: 50 });
    expect(geo.nodes.length).toBe(16 * 50);
  });

  it("Single Line: strings x nodesPerString", () => {
    const geo = computeSingleLine({ strings: 1, nodesPerString: 50 });
    expect(geo.nodes.length).toBe(50);
    expect(geo.height).toBe(1);
  });

  it("Poly Line: totalNodes is authoritative", () => {
    const geo = computePolyLine({ totalNodes: 50 });
    expect(geo.nodes.length).toBe(50);
  });

  it("Arches: archCount x nodesPerArch", () => {
    const geo = computeArches({ archCount: 5, nodesPerArch: 50 });
    expect(geo.nodes.length).toBe(5 * 50);
    expect(geo.width).toBe(50);
    expect(geo.height).toBe(5);
  });

  it("Candy Canes: caneCount x nodesPerCane", () => {
    const geo = computeCandyCanes({ caneCount: 3, nodesPerCane: 18 });
    expect(geo.nodes.length).toBe(3 * 18);
  });

  it("Circle: strings x nodesPerString, single ring by default", () => {
    const geo = computeCircle({ strings: 2, nodesPerString: 50 });
    expect(geo.nodes.length).toBe(100);
    expect(geo.height).toBe(1); // one layer
  });

  it("Circle: custom layer sizes must sum to total", () => {
    expect(() => computeCircle({ strings: 1, nodesPerString: 30, layerSizes: [10, 10] })).toThrow();
    const geo = computeCircle({ strings: 1, nodesPerString: 30, layerSizes: [20, 10] });
    expect(geo.nodes.length).toBe(30);
    expect(geo.height).toBe(2);
  });

  it("Star: strings x nodesPerString", () => {
    const geo = computeStar({ strings: 1, nodesPerString: 50, points: 5 });
    expect(geo.nodes.length).toBe(50);
  });

  it("Tree: strings x nodesPerString (subclass of Matrix)", () => {
    const geo = computeTree({ strings: 16, nodesPerString: 50 });
    expect(geo.nodes.length).toBe(16 * 50);
  });

  it("Tree: Ribbon/Flat/Round all preserve node count", () => {
    for (const style of ["Round", "Flat", "Ribbon"] as const) {
      const geo = computeTree({ strings: 8, nodesPerString: 20, style });
      expect(geo.nodes.length).toBe(160);
    }
  });

  it("Icicles: strings x nodesPerString, distributed by drop pattern", () => {
    const geo = computeIcicles({ strings: 1, nodesPerString: 16, dropPattern: [3, 4, 5, 4] });
    expect(geo.nodes.length).toBe(16);
    expect(geo.width).toBe(4); // 3+4+5+4=16 exactly one full cycle
    expect(geo.height).toBe(5);
  });

  it("Icicles: pattern repeats and truncates on the last drop", () => {
    const geo = computeIcicles({ strings: 1, nodesPerString: 10, dropPattern: [3, 4] });
    // 3 + 4 + 3 = 10 (third drop truncated from would-be 4 down to remaining 3)
    expect(geo.nodes.length).toBe(10);
    expect(geo.width).toBe(3);
  });

  it("Window Frame: top + 2*leftRight + bottom", () => {
    const geo = computeWindowFrame({ top: 16, leftRight: 50, bottom: 16 });
    expect(geo.nodes.length).toBe(16 + 50 * 2 + 16);
  });

  it("Wreath: strings x nodesPerString, buffer side = total+1", () => {
    const geo = computeWreath({ strings: 2, nodesPerString: 25 });
    expect(geo.nodes.length).toBe(50);
    expect(geo.width).toBe(51);
    expect(geo.height).toBe(51);
  });

  it("Custom: node count = distinct node numbers in the grid", () => {
    // 2x2 grid, layer 1: nodes 1,2,3,4 (row-major, comma-separated cols, ; separated rows)
    const geo = parseCustomModelGrid("1,2;3,4");
    expect(geo.nodes.length).toBe(4);
    expect(geo.width).toBe(2);
    expect(geo.height).toBe(2);
  });

  it("Custom: blank cells are gaps, not nodes", () => {
    const geo = parseCustomModelGrid("1,,2;,3,");
    expect(geo.nodes.length).toBe(3);
  });

  it("Custom: multiple layers accumulate distinct node numbers", () => {
    const geo = parseCustomModelGrid("1,2|3,4");
    expect(geo.nodes.length).toBe(4);
  });
});

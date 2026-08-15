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
});

// None of the shape below was pinned before, which is how the screen coords came to mix two
// unit systems - node-index units up the Y axis, ratio units across X - and went unnoticed
// until someone looked at a rendered layout. Every node-count test above passed throughout.
describe("Tree screen shape", () => {
  // The widest span at a given height: "how wide is the tree there", for a cone whose nodes are
  // wrapped around it.
  const spanAtRow = (geo: ReturnType<typeof computeTree>, bufY: number): number => {
    const xs = geo.nodes.filter((n) => n.bufY === bufY).map((n) => n.screenX);
    return Math.max(...xs) - Math.min(...xs);
  };
  const boundsOf = (geo: ReturnType<typeof computeTree>) => {
    const xs = geo.nodes.map((n) => n.screenX);
    const ys = geo.nodes.map((n) => n.screenY);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  it("is widest at the base and narrowest at the apex", () => {
    // The orientation test. `bufY` counts up from the bottom, and both renderers draw larger
    // world Y higher up the screen, so the base is bufY=0. A cone that had this backwards would
    // still pass every node-count test there is.
    for (const style of ["Round", "Flat"] as const) {
      const geo = computeTree({ strings: 16, nodesPerString: 50, style });
      expect(spanAtRow(geo, 0), style).toBeGreaterThan(spanAtRow(geo, 49));
      // and monotonically, not only at the two ends
      for (let y = 1; y < 50; y++) {
        expect(spanAtRow(geo, y), `${style} row ${y}`).toBeLessThanOrEqual(spanAtRow(geo, y - 1) + 1e-9);
      }
    }
  });

  it("tapers by bottomTopRatio, not by how many nodes are on a string", () => {
    for (const ratio of [2, 6, 10]) {
      const geo = computeTree({ strings: 16, nodesPerString: 50, bottomTopRatio: ratio });
      expect(spanAtRow(geo, 0) / spanAtRow(geo, 49)).toBeCloseTo(ratio, 5);
    }
  });

  it("is a cone rather than a pair of vertical lines, at any node count", () => {
    // The bug this pins: the height was a real count of nodes and the radius was in raw
    // `bottomTopRatio` units (1..6), so a 50-node string made a cone 51 tall and 12 wide -
    // sides 5.8 degrees off vertical, with every strand converging into one dense blob at the
    // top. The aspect has to hold whatever the node counts are, because it's a property of the
    // tree's build, not of how many bulbs are on it.
    for (const nodesPerString of [20, 50, 200]) {
      const b = boundsOf(computeTree({ strings: 16, nodesPerString }));
      expect(b.w / b.h, `${nodesPerString} nodes`).toBeCloseTo(0.75, 1);
    }
  });

  it("stays in node units, so it isn't dwarfed by a matrix of the same node count", () => {
    // units.ts: one local unit is the spacing between adjacent nodes. The ring types were moved
    // onto this rule after normalizing made them ~25x too small next to a matrix under a real
    // show's ScaleX; a Tree normalized into a 2-unit box would have exactly that problem.
    const b = boundsOf(computeTree({ strings: 16, nodesPerString: 50 }));
    expect(b.h).toBeCloseTo(49, 6); // same as a 50-node line
    expect(b.w).toBeGreaterThan(10);
  });

  it("wraps round the cone in Z, in the same units as X and Y", () => {
    // The cone is a cone, not a filled triangle - and its depth matches its width, which it
    // didn't when Z spanned the radius units while Y spanned node indices.
    const geo = computeTree({ strings: 16, nodesPerString: 50 });
    const zs = geo.nodes.map((n) => n.screenZ ?? 0);
    const xs = geo.nodes.map((n) => n.screenX);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 1);
  });

  it("keeps all three styles the same height, so changing TreeType reshapes without resizing", () => {
    for (const style of ["Round", "Flat", "Ribbon"] as const) {
      expect(boundsOf(computeTree({ strings: 16, nodesPerString: 50, style })).h, style).toBeCloseTo(49, 6);
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

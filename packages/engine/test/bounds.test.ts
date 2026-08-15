import { describe, expect, it } from "vitest";
import { geometryScreenBounds } from "../src/models/bounds";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeCircle } from "../src/models/circle";
import { computeTree } from "../src/models/tree";

describe("geometryScreenBounds", () => {
  it("matches buffer width/height for a Matrix (screen coords == buffer coords)", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 3 });
    const b = geometryScreenBounds(geo);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(3); // strings - 1
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(2); // nodesPerString - 1
  });

  it("sizes a ring in node units, not as a normalized unit circle", () => {
    // units.ts: one local unit == the spacing between adjacent nodes, for every model type.
    // A ring of N nodes therefore has circumference N, so diameter N/pi - NOT a fixed 2, and
    // not the buffer width either. xLights' ScaleX multiplies a node-unit render size, so a
    // normalized ring imported ~25x too small next to a matrix of the same node count.
    const geo = computeCircle({ strings: 1, nodesPerString: 50 });
    const b = geometryScreenBounds(geo);
    expect(b.maxX - b.minX).toBeCloseTo(50 / Math.PI, 1);
    expect(b.maxY - b.minY).toBeCloseTo(50 / Math.PI, 1);

    // and it scales with node count, unlike the old fixed-radius version
    const bigger = geometryScreenBounds(computeCircle({ strings: 1, nodesPerString: 200 }));
    expect(bigger.maxX - bigger.minX).toBeCloseTo(200 / Math.PI, 1);
  });

  it("a Tree's real width comes from its shape, not the strings count", () => {
    const geo = computeTree({ strings: 16, nodesPerString: 50, bottomTopRatio: 6 });
    const b = geometryScreenBounds(geo);
    // The widest row is the base, which is sized against the tree's height in node units - so
    // ~37 for a 50-node string, and nothing like `strings` (16, which is the buffer width
    // geo.width would report).
    //
    // This used to expect ~12: the base radius in raw `bottomTopRatio` units, back when that
    // ratio was doubling as a length. That was the bug - the height beside it was a real count
    // of nodes, so the cone came out 51 tall and 12 wide. The number here changed; what the
    // test is *for* did not.
    expect(b.maxX - b.minX).toBeCloseTo(36.75, 1);
  });

  it("returns a degenerate zero box for an empty geometry, not NaN/Infinity", () => {
    const b = geometryScreenBounds({ width: 0, height: 0, nodes: [] });
    expect(b).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});

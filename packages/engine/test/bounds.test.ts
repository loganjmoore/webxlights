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

  it("is a unit circle regardless of node count, unrelated to buffer width/height", () => {
    const geo = computeCircle({ strings: 1, nodesPerString: 50 });
    const b = geometryScreenBounds(geo);
    expect(b.maxX - b.minX).toBeCloseTo(2, 1); // diameter ~2 (radius 1), not 50
    expect(b.maxY - b.minY).toBeCloseTo(2, 1);
  });

  it("a Tree's real width comes from bottomTopRatio, not the strings count", () => {
    const geo = computeTree({ strings: 16, nodesPerString: 50, bottomTopRatio: 6 });
    const b = geometryScreenBounds(geo);
    // widest row is the base (radius == bottomTopRatio == 6), so the real span is ~12,
    // nothing like `strings` (16, the buffer width geo.width would report).
    expect(b.maxX - b.minX).toBeGreaterThan(10);
    expect(b.maxX - b.minX).toBeLessThan(13);
  });

  it("returns a degenerate zero box for an empty geometry, not NaN/Infinity", () => {
    const b = geometryScreenBounds({ width: 0, height: 0, nodes: [] });
    expect(b).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});

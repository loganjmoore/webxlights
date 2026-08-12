import { describe, expect, it } from "vitest";
import { geometryCenter, nodeWorldOffset, transformedHalfExtents } from "../src/models/transform";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeIcicles } from "../src/models/icicles";

describe("geometryCenter", () => {
  it("is the bounding-box midpoint, not (0,0)", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 });
    expect(geometryCenter(geo)).toEqual({ x: 2, y: 1 }); // (0..4)/2, (0..2)/2
  });

  it("for an asymmetric shape (Icicles hangs entirely below y=0), the center is not the anchor", () => {
    const geo = computeIcicles({ strings: 1, nodesPerString: 4, dropPattern: [4] });
    const c = geometryCenter(geo);
    expect(c.y).toBeLessThan(0); // real xLights centers WorldPosY on the model's midpoint
  });
});

describe("nodeWorldOffset", () => {
  it("with no rotation, is just the scaled offset from center", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 1 });
    const center = geometryCenter(geo); // {x:1, y:0}
    const node = geo.nodes.find((n) => n.bufX === 2)!;
    const off = nodeWorldOffset(node, center, {});
    expect(off).toEqual({ x: 1, y: 0 });
  });

  it("scales per-axis independently (scaleY defaults to scale when absent)", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 3 });
    const center = geometryCenter(geo);
    const node = geo.nodes.find((n) => n.bufX === 2 && n.bufY === 2)!; // offset (1, 1) from center
    expect(nodeWorldOffset(node, center, { scale: 2 })).toEqual({ x: 2, y: 2 });
    const nonUniform = nodeWorldOffset(node, center, { scale: 2, scaleY: 3 });
    expect(nonUniform.x).toBeCloseTo(2);
    expect(nonUniform.y).toBeCloseTo(3);
  });

  it("a 90 degree rotation swaps the axes (counter-clockwise-positive in a Y-up system)", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 1 });
    const center = geometryCenter(geo);
    const node = geo.nodes.find((n) => n.bufX === 2)!; // offset (1, 0) from center
    const off = nodeWorldOffset(node, center, { rotateDeg: 90 });
    expect(off.x).toBeCloseTo(0);
    expect(off.y).toBeCloseTo(1);
  });

  it("a 360 degree rotation is a no-op", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 5 });
    const center = geometryCenter(geo);
    for (const node of geo.nodes) {
      const off = nodeWorldOffset(node, center, { rotateDeg: 360 });
      expect(off.x).toBeCloseTo(node.screenX - center.x);
      expect(off.y).toBeCloseTo(node.screenY - center.y);
    }
  });
});

describe("transformedHalfExtents", () => {
  it("matches half the bounding box for an unrotated, unscaled shape", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 });
    expect(transformedHalfExtents(geo, {})).toEqual({ halfW: 2, halfH: 1 });
  });

  it("grows with scale", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 });
    expect(transformedHalfExtents(geo, { scale: 2 })).toEqual({ halfW: 4, halfH: 2 });
  });

  it("a 90 degree rotation swaps halfW/halfH for a rectangle", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 }); // halfW 2, halfH 1
    const rotated = transformedHalfExtents(geo, { rotateDeg: 90 });
    expect(rotated.halfW).toBeCloseTo(1);
    expect(rotated.halfH).toBeCloseTo(2);
  });

  it("returns a zero box for an empty geometry, not NaN", () => {
    expect(transformedHalfExtents({ width: 0, height: 0, nodes: [] }, {})).toEqual({ halfW: 0, halfH: 0 });
  });
});

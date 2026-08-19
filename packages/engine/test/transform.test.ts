import { describe, expect, it } from "vitest";
import { geometryCenter, nodeWorldOffset, transformedHalfExtents } from "../src/models/transform";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeIcicles } from "../src/models/icicles";
import { computeTree } from "../src/models/tree";
import { computeSingleLine } from "../src/models/line";

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
    expect(off).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("scales per-axis independently (scaleY defaults to scale when absent)", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 3 });
    const center = geometryCenter(geo);
    const node = geo.nodes.find((n) => n.bufX === 2 && n.bufY === 2)!; // offset (1, 1) from center
    expect(nodeWorldOffset(node, center, { scale: 2 })).toEqual({ x: 2, y: 2, z: 0 });
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
    expect(transformedHalfExtents(geo, {})).toEqual({ halfW: 2, halfH: 1, halfD: 0 });
  });

  it("grows with scale", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 });
    expect(transformedHalfExtents(geo, { scale: 2 })).toEqual({ halfW: 4, halfH: 2, halfD: 0 });
  });

  it("a 90 degree rotation swaps halfW/halfH for a rectangle", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 5, nodesPerString: 3 }); // halfW 2, halfH 1
    const rotated = transformedHalfExtents(geo, { rotateDeg: 90 });
    expect(rotated.halfW).toBeCloseTo(1);
    expect(rotated.halfH).toBeCloseTo(2);
  });

  it("returns a zero box for an empty geometry, not NaN", () => {
    expect(transformedHalfExtents({ width: 0, height: 0, nodes: [] }, {})).toEqual({ halfW: 0, halfH: 0, halfD: 0 });
  });
});

describe("per-node depth", () => {
  it("a 360-degree tree wraps onto the Z axis, not into its Y offset", () => {
    // The wrap used to be folded into screenY as a "depth cue", which collapsed the cone into
    // a filled triangle in both the 2D and 3D views - the most visible difference against real
    // xLights' 3D layout, where a mega tree reads as a cone with an elliptical base.
    const tree = computeTree({ strings: 24, nodesPerString: 30, degrees: 360, bottomTopRatio: 6 });
    const depths = tree.nodes.map((n) => n.screenZ ?? 0);
    const xs = tree.nodes.map((n) => n.screenX);
    const zSpan = Math.max(...depths) - Math.min(...depths);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    expect(zSpan).toBeGreaterThan(0);
    expect(zSpan).toBeCloseTo(xSpan, 5); // a round tree is as deep as it is wide

    // and its height comes from the strand, uncontaminated by the wrap
    const bottomRow = tree.nodes.filter((n) => n.bufY === 0);
    expect(new Set(bottomRow.map((n) => n.screenY)).size).toBe(1);
  });

  it("a flat prop has no depth, so nothing moves on Z", () => {
    const line = computeSingleLine({ strings: 1, nodesPerString: 5 });
    for (const node of line.nodes) {
      expect(nodeWorldOffset(node, geometryCenter(line), { scale: 2 }).z).toBe(0);
    }
  });

  it("depth scales with scaleZ, and RotateZ leaves it alone", () => {
    const node = { bufX: 0, bufY: 0, screenX: 0, screenY: 0, screenZ: 3, string: 0, indexInString: 0 };
    const center = { x: 0, y: 0 };
    expect(nodeWorldOffset(node, center, { scale: 1, scaleZ: 2 }).z).toBe(6);
    // RotateZ spins the model in its own X/Y plane
    expect(nodeWorldOffset(node, center, { scale: 1, scaleZ: 2, rotateDeg: 90 }).z).toBe(6);
  });
});

describe("a negative scale is a frame convention at render time too", () => {
  // The importer takes the magnitude, but only for models it imports. A layout saved before it
  // learned to do that still holds the negative, and the tree it belongs to renders upside down
  // every time it is opened until something takes the magnitude at the point of use.
  const node = { bufX: 0, bufY: 0, screenX: 2, screenY: 4, screenZ: 6, string: 0, indexInString: 0 };
  const centre = { x: 0, y: 0 };

  it("puts a node in the same place whichever sign the scale was stored with", () => {
    const positive = nodeWorldOffset(node, centre, { scale: 3, scaleY: 2, scaleZ: 4 });
    const negative = nodeWorldOffset(node, centre, { scale: -3, scaleY: -2, scaleZ: -4 });
    expect(negative).toEqual(positive);
  });

  it("does the same when scaleY falls back to scale", () => {
    expect(nodeWorldOffset(node, centre, { scale: -2 })).toEqual(nodeWorldOffset(node, centre, { scale: 2 }));
  });

  it("leaves rotation alone - a deliberate half turn is still a half turn", () => {
    const turned = nodeWorldOffset(node, centre, { scale: 1, rotateDeg: 180 });
    expect(turned.x).toBeCloseTo(-2, 6);
    expect(turned.y).toBeCloseTo(-4, 6);
  });
});

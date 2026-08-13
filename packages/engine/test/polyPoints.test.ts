import { describe, expect, it } from "vitest";
import { parsePolyPointPath } from "../src/models/polyPoints";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import { appliedPlacementFor, screenFromAttrs } from "../src/models/placement";
import { geometryCenter, nodeWorldOffset } from "../src/models/transform";
import type { ModelGeometry } from "../src/models/types";

const SPACING = 4; // the canvases' NODE_SPACING

function geo(attrs: Record<string, string>): ModelGeometry {
  const g = computeGeometryFromAttrs("Poly Line", attrs);
  if (!g) throw new Error("no geometry for Poly Line");
  return g;
}

// Where a model's nodes actually land in the world, which is the only thing that matters: it's
// what both renderers draw and what hit-testing uses. Mirrors LayoutCanvas/the 3D view.
function worldNodes(attrs: Record<string, string>): Array<{ x: number; y: number; z: number }> {
  const g = geo(attrs);
  const screen = screenFromAttrs("Poly Line", attrs, g, SPACING);
  const center = geometryCenter(g);
  return g.nodes.map((n) => {
    const off = nodeWorldOffset(n, center, {
      scale: screen.scale,
      scaleY: screen.scaleY,
      scaleZ: screen.scaleZ,
      rotateDeg: screen.rotate,
    });
    return { x: screen.x + off.x * SPACING, y: screen.y + off.y * SPACING, z: screen.z + off.z * SPACING };
  });
}

function closestTo(points: Array<{ x: number; y: number; z: number }>, target: { x: number; y: number }): number {
  return Math.min(...points.map((p) => Math.hypot(p.x - target.x, p.y - target.y)));
}

describe("PolyPointScreenLocation: PointData parsing", () => {
  it("reads x,y,z triples", () => {
    const path = parsePolyPointPath({ NumPoints: "3", PointData: "0,0,0,100,0,0,100,50,0" }, 51);
    expect(path?.units).toBe("world");
    expect(path?.world).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 50, z: 0 },
    ]);
    expect(path?.worldLength).toBeCloseTo(150);
  });

  it("reads x,y pairs when NumPoints says so", () => {
    // 8 values / 4 points == a stride of 2. Without NumPoints this list divides evenly both
    // ways, so the count is what disambiguates it.
    const path = parsePolyPointPath({ NumPoints: "4", PointData: "0,0,10,0,10,10,20,10" }, 21);
    expect(path?.world).toHaveLength(4);
    expect(path?.world[2]).toEqual({ x: 10, y: 10, z: 0 });
  });

  it("tolerates whitespace-separated data", () => {
    const path = parsePolyPointPath({ NumPoints: "2", PointData: "0 0 0  200 0 0" }, 51);
    expect(path?.worldLength).toBeCloseTo(200);
  });

  it("treats 0..1 data as normalized and sizes it with ScaleX/Y/Z", () => {
    const path = parsePolyPointPath(
      { NumPoints: "3", PointData: "0,0,0,0.5,0,0,1,1,0", ScaleX: "200", ScaleY: "80" },
      51,
    );
    expect(path?.units).toBe("normalized");
    expect(path?.world[1]).toMatchObject({ x: 100, y: 0 });
    expect(path?.world[2]).toMatchObject({ x: 200, y: 80 });
  });

  it("anchors the path on its first vertex, whatever that vertex is", () => {
    // The two conventions disagree about size but never about position, because vertex 0 is
    // WorldPos - the same thing TwoPointScreenLocation does with its start handle.
    const path = parsePolyPointPath({ NumPoints: "2", PointData: "40,90,0,140,90,0" }, 51);
    expect(path?.world[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(path?.world[1]).toMatchObject({ x: 100, y: 0 });
  });

  it("normalizes the local path to one unit per node gap", () => {
    // The convention every model type shares (units.ts), so ScaleX means the same thing here as
    // it does for a matrix.
    const path = parsePolyPointPath({ NumPoints: "2", PointData: "0,0,0,300,0,0" }, 51);
    expect(path?.localLength).toBe(50);
    expect(path?.local[1]?.x).toBeCloseTo(50);
  });

  it("returns null for data that can't describe a path", () => {
    expect(parsePolyPointPath({}, 50)).toBeNull();
    expect(parsePolyPointPath({ PointData: "" }, 50)).toBeNull();
    expect(parsePolyPointPath({ PointData: "0,0,0" }, 50)).toBeNull(); // one point isn't a path
    expect(parsePolyPointPath({ NumPoints: "2", PointData: "5,5,5,5,5,5" }, 50)).toBeNull(); // zero length
  });
});

describe("Poly Line geometry follows its vertices", () => {
  it("an L-shaped run turns the corner instead of coming in straight", () => {
    // The bug this fixes: PointData was ignored, so a house outline imported as a flat
    // horizontal line of the right node count in the wrong shape.
    const g = geo({ NodesPerString: "41", NumPoints: "3", PointData: "0,0,0,100,0,0,100,100,0" });
    expect(g.nodes).toHaveLength(41);
    const ys = g.nodes.map((n) => n.screenY);
    expect(Math.max(...ys)).toBeGreaterThan(1); // it climbs
    const last = g.nodes[g.nodes.length - 1]!;
    expect(last.screenY).toBeGreaterThan(last.screenX / 2); // and ends up the vertical leg
  });

  it("nodes stay evenly spaced across the corner", () => {
    const g = geo({ NodesPerString: "41", NumPoints: "3", PointData: "0,0,0,100,0,0,100,100,0" });
    const gaps: number[] = [];
    for (let i = 1; i < g.nodes.length; i++) {
      const a = g.nodes[i - 1]!;
      const b = g.nodes[i]!;
      gaps.push(Math.hypot(b.screenX - a.screenX, b.screenY - a.screenY));
    }
    // one local unit per gap, give or take the corner node that straddles two segments
    expect(Math.max(...gaps)).toBeLessThan(1.2);
    expect(Math.min(...gaps)).toBeGreaterThan(0.7);
  });

  it("carries vertex depth into screenZ so a run that climbs isn't flattened", () => {
    const g = geo({ NodesPerString: "21", NumPoints: "2", PointData: "0,0,0,100,0,60" });
    const last = g.nodes[g.nodes.length - 1]!;
    expect(last.screenZ).toBeGreaterThan(1);
  });

  it("is still a straight line when there's no PointData", () => {
    // A Poly Line drawn in webXLights has no vertices yet, and that's not a failure.
    const g = geo({ NodesPerString: "30" });
    expect(g.nodes.every((n) => n.screenY === 0)).toBe(true);
    expect(g.nodes).toHaveLength(30);
  });
});

describe("Poly Line placement lands its vertices where xLights put them", () => {
  const ATTRS = {
    NodesPerString: "41",
    NumPoints: "3",
    PointData: "0,0,0,100,0,0,100,100,0",
    WorldPosX: "300",
    WorldPosY: "50",
    WorldPosZ: "0",
  };

  it("reports polyLine, not boxed", () => {
    expect(appliedPlacementFor("Poly Line", ATTRS)).toBe("polyLine");
  });

  it("falls back to boxed when there's nothing to place against", () => {
    expect(appliedPlacementFor("Poly Line", { WorldPosX: "10", ScaleX: "2" })).toBe("boxed");
    const screen = screenFromAttrs("Poly Line", { WorldPosX: "10", WorldPosY: "20", ScaleX: "3", RotateZ: "15" }, geo({}), SPACING);
    expect(screen).toMatchObject({ x: 10, y: 20, scale: 3 / SPACING, rotate: 15 });
  });

  it("puts every vertex at WorldPos + its own offset", () => {
    const nodes = worldNodes(ATTRS);
    expect(closestTo(nodes, { x: 300, y: 50 })).toBeLessThan(3); // start
    expect(closestTo(nodes, { x: 400, y: 50 })).toBeLessThan(3); // corner
    expect(closestTo(nodes, { x: 400, y: 150 })).toBeLessThan(3); // end
  });

  it("doesn't add a rotation on top of a shape that already has the angles", () => {
    const screen = screenFromAttrs("Poly Line", ATTRS, geo(ATTRS), SPACING);
    expect(screen.rotate).toBe(0);
    expect(screen.scaleY).toBeCloseTo(screen.scale); // uniform, or the corners would bend
  });

  it("places normalized point data the same way it places world data", () => {
    // Same run, both conventions: the reading only changes how the numbers are sized, so the
    // model has to end up in the same place either way.
    const normalized = worldNodes({
      NodesPerString: "41",
      NumPoints: "3",
      PointData: "0,0,0,1,0,0,1,1,0",
      ScaleX: "100",
      ScaleY: "100",
      WorldPosX: "300",
      WorldPosY: "50",
    });
    expect(closestTo(normalized, { x: 300, y: 50 })).toBeLessThan(3);
    expect(closestTo(normalized, { x: 400, y: 150 })).toBeLessThan(3);
  });

  it("carries WorldPosZ and per-vertex depth into world Z", () => {
    const nodes = worldNodes({
      NodesPerString: "21",
      NumPoints: "2",
      PointData: "0,0,0,100,0,60",
      WorldPosX: "0",
      WorldPosY: "0",
      WorldPosZ: "10",
    });
    expect(nodes[0]!.z).toBeCloseTo(10, 1);
    expect(nodes[nodes.length - 1]!.z).toBeCloseTo(70, 1);
  });

  it("spans the distance its vertices describe, whatever its node count", () => {
    // Node count changes the local units the path is expressed in; it must not change the size
    // of the prop in the yard.
    for (const nodes of ["21", "41", "200"]) {
      const placed = worldNodes({ NodesPerString: nodes, NumPoints: "2", PointData: "0,0,0,240,0,0", WorldPosX: "0", WorldPosY: "0" });
      const span = Math.max(...placed.map((p) => p.x)) - Math.min(...placed.map((p) => p.x));
      expect(span, `with ${nodes} nodes`).toBeCloseTo(240, 1);
    }
  });
});

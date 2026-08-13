import type { ModelGeometry, ModelNode } from "./types";

export interface SingleLineParams {
  strings: number;
  nodesPerString: number;
}

// SPEC ch4: "Buffer 1 row x total nodes". Green Square (left) start only.
export function computeSingleLine(params: SingleLineParams): ModelGeometry {
  const total = params.strings * params.nodesPerString;
  const nodes: ModelNode[] = [];
  for (let i = 0; i < total; i++) {
    nodes.push({ bufX: i, bufY: 0, screenX: i, screenY: 0, string: 0, indexInString: i });
  }
  return { width: total, height: 1, nodes };
}

export interface PolyLineParams {
  totalNodes: number;
  // Path vertices in local node units (one unit == one node gap), defaulting to a straight
  // line. Imported models get these from PointData - see models/polyPoints.ts. `z` is optional
  // because a Poly Line drawn on the 2D canvas is planar; a real one that climbs a roofline is
  // not, and its depth has to survive into the 3D view.
  points?: Array<{ x: number; y: number; z?: number }>;
}

// SPEC ch4: "# Lights|# Nodes (PolyLineNodes) IS the total node count", buffer default = 1xN
// like Single Line ("+ Line Segments" is an additional, non-default style).
// ponytail: nodes are evenly distributed along the (possibly multi-segment) polyline by arc
// length; per-segment curve control points (cPointData) are a later ceiling — straight
// segments between vertices only.
export function computePolyLine(params: PolyLineParams): ModelGeometry {
  const { totalNodes } = params;
  const points = params.points && params.points.length >= 2 ? params.points : [
    { x: 0, y: 0 },
    { x: totalNodes - 1 || 1, y: 0 },
  ];

  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) || 1e-6;
    segLengths.push(len);
    totalLength += len;
  }

  const nodes: ModelNode[] = [];
  for (let i = 0; i < totalNodes; i++) {
    const dist = totalNodes > 1 ? (i / (totalNodes - 1)) * totalLength : 0;
    let remaining = dist;
    let segIdx = 0;
    while (segIdx < segLengths.length - 1 && remaining > segLengths[segIdx]!) {
      remaining -= segLengths[segIdx]!;
      segIdx++;
    }
    const a = points[segIdx]!;
    const b = points[segIdx + 1]!;
    const t = segLengths[segIdx]! > 0 ? remaining / segLengths[segIdx]! : 0;
    const screenX = a.x + (b.x - a.x) * t;
    const screenY = a.y + (b.y - a.y) * t;
    const az = a.z ?? 0;
    const screenZ = az + ((b.z ?? 0) - az) * t;
    nodes.push({ bufX: i, bufY: 0, screenX, screenY, screenZ, string: 0, indexInString: i });
  }
  return { width: totalNodes, height: 1, nodes };
}

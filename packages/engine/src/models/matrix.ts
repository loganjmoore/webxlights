import type { ModelGeometry, ModelNode } from "./types";

export interface MatrixParams {
  strings: number;
  nodesPerString: number;
}

// ponytail: Vertical / Top Left / zigzag-on / strandsPerString=1 only (the MatrixModel default).
// Horizontal, other starting corners, Don't Zig Zag, Alternate Nodes, and Strands/String > 1
// are a documented ceiling; add when a real imported model needs them.
export function computeVerticalMatrixTopLeft(params: MatrixParams): ModelGeometry {
  const { strings: width, nodesPerString: height } = params;
  const nodes: ModelNode[] = [];
  for (let s = 0; s < width; s++) {
    const topToBottom = s % 2 === 0; // serpentine zigzag wiring
    for (let n = 0; n < height; n++) {
      const bufY = topToBottom ? height - 1 - n : n;
      nodes.push({ bufX: s, bufY, screenX: s, screenY: bufY, string: s, indexInString: n });
    }
  }
  return { width, height, nodes };
}

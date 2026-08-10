import type { ModelGeometry, ModelNode } from "./types";

export interface CandyCaneParams {
  caneCount: number;
  nodesPerCane: number;
}

// SPEC ch4: nodes = canes x nodesPerCane. Buffer: height=nodes per cane, width=#canes.
// Screen: a simple cane silhouette (straight pole + curved crook at top).
// ponytail: Reverse/Sticks/Alternate Nodes/Rotation params deferred.
export function computeCandyCanes(params: CandyCaneParams): ModelGeometry {
  const { caneCount, nodesPerCane } = params;
  const crookNodes = Math.max(1, Math.round(nodesPerCane * 0.25));
  const nodes: ModelNode[] = [];
  for (let c = 0; c < caneCount; c++) {
    for (let n = 0; n < nodesPerCane; n++) {
      let screenX: number;
      let screenY: number;
      if (n < nodesPerCane - crookNodes) {
        screenX = c;
        screenY = n;
      } else {
        const crookT = (n - (nodesPerCane - crookNodes)) / crookNodes;
        const angle = Math.PI * crookT; // 0..PI sweep for the hook
        screenX = c + Math.sin(angle) * 0.5;
        screenY = nodesPerCane - crookNodes + Math.cos(angle) * 0.5;
      }
      nodes.push({ bufX: c, bufY: n, screenX, screenY, string: c, indexInString: n });
    }
  }
  return { width: caneCount, height: nodesPerCane, nodes };
}

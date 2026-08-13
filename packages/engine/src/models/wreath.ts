import type { ModelGeometry, ModelNode } from "./types";
import { ringRadiusForNodeCount } from "./units";

export interface WreathParams {
  strings: number;
  nodesPerString: number;
}

// SPEC ch4: nodes = strings x nodesPerString around a ring; buffer is a square of side
// (total+1) with nodes placed on the circle.
export function computeWreath(params: WreathParams): ModelGeometry {
  const total = params.strings * params.nodesPerString;
  const side = total + 1;
  const nodes: ModelNode[] = [];
  for (let n = 0; n < total; n++) {
    const angle = (n / total) * 2 * Math.PI;
    // scaled into node units (units.ts), like every other model type
    const screenX = Math.cos(angle) * ringRadiusForNodeCount(total);
    const screenY = Math.sin(angle) * ringRadiusForNodeCount(total);
    nodes.push({ bufX: n, bufY: 0, screenX, screenY, string: 0, indexInString: n });
  }
  return { width: side, height: side, nodes };
}

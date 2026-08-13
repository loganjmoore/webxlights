import type { ModelGeometry, ModelNode } from "./types";
import { ringRadiusForNodeCount } from "./units";

export interface CircleParams {
  strings: number;
  nodesPerString: number;
  centerPercent?: number; // inner-ring diameter as % of outer, default 0
  layerSizes?: number[]; // node count per ring, outer first; default = single ring, all nodes
}

// SPEC ch4: total = strings x nodesPerString, distributed over concentric rings (Layer Sizes;
// default = single ring). Buffer: square maxRingSize grid; nodes placed around each ring.
export function computeCircle(params: CircleParams): ModelGeometry {
  const total = params.strings * params.nodesPerString;
  const centerPercent = params.centerPercent ?? 0;
  const layerSizes = params.layerSizes && params.layerSizes.length > 0 ? params.layerSizes : [total];

  const nodes: ModelNode[] = [];
  const numLayers = layerSizes.length;
  // Outer ring sized so adjacent nodes sit ~1 local unit apart, the same unit every other
  // model type uses (units.ts) - not a normalized unit circle.
  const outerRadius = ringRadiusForNodeCount(Math.max(...layerSizes));
  let idx = 0;
  for (let layer = 0; layer < numLayers; layer++) {
    const size = layerSizes[layer]!;
    // outer layer (index 0) = radius 1; inner layers step down toward centerPercent
    const radius = numLayers > 1 ? 1 - (layer / (numLayers - 1)) * (1 - centerPercent / 100) : 1;
    for (let n = 0; n < size; n++) {
      const angle = (n / size) * 2 * Math.PI;
      const screenX = Math.cos(angle) * radius * outerRadius;
      const screenY = Math.sin(angle) * radius * outerRadius;
      nodes.push({ bufX: n, bufY: layer, screenX, screenY, string: layer, indexInString: n });
      idx++;
    }
  }
  const maxRingSize = Math.max(...layerSizes);
  if (idx !== total) throw new Error(`Circle layerSizes sum ${idx} !== total nodes ${total}`);
  return { width: maxRingSize, height: numLayers, nodes };
}

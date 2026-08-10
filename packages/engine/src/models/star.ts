import type { ModelGeometry, ModelNode } from "./types";

export interface StarParams {
  strings: number;
  nodesPerString: number;
  points: number; // StarStrandCount, default 5
  outerToInnerRatio?: number; // StarRatio, default golden ratio 2.618034
}

// SPEC ch4: total = strings x nodesPerString. ponytail: single-layer only (default creation
// case); multi-layer Star (Layer Sizes, Inner Layer %) is a later ceiling.
export function computeStar(params: StarParams): ModelGeometry {
  const total = params.strings * params.nodesPerString;
  const points = params.points;
  const ratio = params.outerToInnerRatio ?? 2.618034;
  const nodes: ModelNode[] = [];

  for (let n = 0; n < total; n++) {
    const t = total > 1 ? n / total : 0;
    const angle = t * 2 * Math.PI - Math.PI / 2;
    // 5-point-star radial profile: oscillate between outer (1) and inner (1/ratio) radius,
    // `points` times per revolution.
    const pointPhase = (t * points) % 1;
    const triangle = pointPhase < 0.5 ? pointPhase * 2 : 2 - pointPhase * 2;
    const radius = 1 / ratio + (1 - 1 / ratio) * triangle;
    const screenX = Math.cos(angle) * radius;
    const screenY = Math.sin(angle) * radius;
    nodes.push({ bufX: n, bufY: 0, screenX, screenY, string: 0, indexInString: n });
  }
  return { width: total, height: 1, nodes };
}

import type { ModelGeometry, ModelNode } from "./types";

export interface ArchesParams {
  archCount: number;
  nodesPerArch: number;
  arcDegrees?: number; // default 180
}

// SPEC ch4: non-layered Arches. Node count = arches x nodesPerArch. Buffer: height=#arches
// (one row per arch), width=nodes per arch. Screen: semicircle per arch (Green Square start).
// ponytail: layered Arches (Hollow%, Zig-Zag Layers, Layer Sizes) deferred — non-layered
// covers the common vendor-model case.
export function computeArches(params: ArchesParams): ModelGeometry {
  const { archCount, nodesPerArch } = params;
  const arcDegrees = params.arcDegrees ?? 180;
  const nodes: ModelNode[] = [];
  for (let a = 0; a < archCount; a++) {
    const radius = archCount - a; // outer arch = largest radius
    for (let n = 0; n < nodesPerArch; n++) {
      const t = nodesPerArch > 1 ? n / (nodesPerArch - 1) : 0;
      const angleDeg = 180 - t * arcDegrees + (180 - arcDegrees) / 2;
      const angle = (angleDeg * Math.PI) / 180;
      const screenX = Math.cos(angle) * radius;
      const screenY = Math.sin(angle) * radius;
      nodes.push({ bufX: n, bufY: a, screenX, screenY, string: a, indexInString: n });
    }
  }
  return { width: nodesPerArch, height: archCount, nodes };
}

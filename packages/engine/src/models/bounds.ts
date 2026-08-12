import type { ModelGeometry } from "./types";

export interface ScreenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// `ModelGeometry.width`/`.height` are buffer dimensions (row/col counts, for effect
// rendering) - NOT a screen-space bounding box. Several model types (Circle, Star, Wreath,
// Arches, Window Frame, Tree's Round/Flat styles) place `screenX`/`screenY` via trigonometry
// or a perimeter walk, so their real on-screen extent has no fixed relationship to
// `width`/`height` at all (e.g. Circle/Star/Wreath normalize to a unit circle regardless of
// node count). Callers that need a model's actual rendered size (canvas auto-fit, hit-testing)
// must derive it from the nodes' real `screenX`/`screenY`, not guess from buffer dimensions.
export function geometryScreenBounds(geo: ModelGeometry): ScreenBounds {
  if (geo.nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of geo.nodes) {
    if (node.screenX < minX) minX = node.screenX;
    if (node.screenX > maxX) maxX = node.screenX;
    if (node.screenY < minY) minY = node.screenY;
    if (node.screenY > maxY) maxY = node.screenY;
  }
  return { minX, maxX, minY, maxY };
}

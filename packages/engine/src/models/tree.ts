import type { ModelGeometry } from "./types";
import { computeVerticalMatrixTopLeft } from "./matrix";

export interface TreeParams {
  strings: number;
  nodesPerString: number;
  style?: "Round" | "Flat" | "Ribbon"; // default Round
  degrees?: number; // Round only, default 360
  bottomTopRatio?: number; // default 6.0 (bottom radius = top radius x ratio)
}

// SPEC ch4: "subclass of MatrixModel... Buffer identical to matrix; screen coords wrap
// strands around a cone" (Round), a flat fan (Flat), or a vertical ribbon strip (Ribbon).
// ponytail: Rotation/Spiral Wraps/Perspective screen-shaping deferred — plain cone/fan/ribbon.
export function computeTree(params: TreeParams): ModelGeometry {
  const style = params.style ?? "Round";
  const degrees = params.degrees ?? 360;
  const bottomTopRatio = params.bottomTopRatio ?? 6.0;
  const geo = computeVerticalMatrixTopLeft({ strings: params.strings, nodesPerString: params.nodesPerString });

  for (const node of geo.nodes) {
    const heightT = geo.height > 1 ? node.bufY / (geo.height - 1) : 0; // 0=bottom, 1=top
    const strandT = geo.width > 1 ? node.bufX / geo.width : 0;

    if (style === "Ribbon") {
      node.screenX = node.bufX;
      node.screenY = node.bufY;
      continue;
    }

    const radius = 1 * heightT + (1 / bottomTopRatio) * (1 - heightT); // top radius 1, bottom wider
    if (style === "Flat") {
      const angle = strandT * (degrees * Math.PI) / 180;
      node.screenX = Math.cos(angle) * radius;
      node.screenY = node.bufY;
    } else {
      const angle = strandT * (degrees * Math.PI) / 180;
      node.screenX = Math.cos(angle) * radius;
      node.screenY = node.bufY + Math.sin(angle) * radius * 0.3; // slight depth cue in 2D
    }
  }
  return geo;
}

import type { ModelGeometry, ModelNode } from "./types";

export type CubeStyle = "Cube" | "Cylinder";

export interface CubeParams {
  width: number;
  height: number;
  depth: number;
  style: CubeStyle;
  strings: number;
  /** Wiring winds back and forth along each row instead of restarting at the same end. */
  zigZag: boolean;
}

// Manual "Cube": "a 3D model that is used to model objects like Pixel/Peace Stakes, Boxes, or
// Grids. While the model is 3D, xLights renders the effects in 2D."
//
// That last sentence is the whole design. The nodes stand in a real box - screenZ carries the
// depth, so the house preview shows a box rather than a flat grid - but the *buffer* is the box
// unwrapped: each depth layer laid out side by side. An effect therefore sweeps across the
// layers in order, which is what "rendered in 2D" has to mean for a shape that isn't flat.
//
// Cylinder is the same nodes wrapped round instead of folded square: "the layers are wrapped
// into a round tube", with Width becoming the circumference.
export function computeCube(params: CubeParams): ModelGeometry {
  const W = Math.max(1, Math.trunc(params.width));
  const H = Math.max(1, Math.trunc(params.height));
  const D = Math.max(1, Math.trunc(params.depth));
  const strings = Math.max(1, Math.trunc(params.strings));

  const nodes: ModelNode[] = [];
  const perString = Math.ceil((W * H * D) / strings);
  let index = 0;

  for (let layer = 0; layer < D; layer++) {
    for (let y = 0; y < H; y++) {
      // "Zig Zag: wiring winds back and forth." Only the wiring reverses - the buffer column is
      // still the node's real position in the row, or an effect would run backwards on every
      // other row.
      const reversed = params.zigZag && y % 2 === 1;
      for (let i = 0; i < W; i++) {
        const x = reversed ? W - 1 - i : i;
        nodes.push({
          bufX: layer * W + x,
          bufY: y,
          ...position(x, y, layer, W, H, D, params.style),
          string: Math.min(strings - 1, Math.floor(index / perString)),
          indexInString: index % perString,
        });
        index++;
      }
    }
  }

  return { width: W * D, height: H, nodes };
}

function position(
  x: number,
  y: number,
  layer: number,
  width: number,
  height: number,
  depth: number,
  style: CubeStyle,
): { screenX: number; screenY: number; screenZ: number } {
  if (style === "Cylinder") {
    // Width is the circumference, so the radius follows from it in the same node-unit convention
    // the ring models use: one unit is the spacing between adjacent nodes.
    const radius = width / (2 * Math.PI);
    const angle = (x / width) * 2 * Math.PI;
    return { screenX: Math.cos(angle) * radius, screenY: y - (height - 1) / 2, screenZ: Math.sin(angle) * radius };
  }
  return {
    screenX: x - (width - 1) / 2,
    screenY: y - (height - 1) / 2,
    screenZ: layer - (depth - 1) / 2,
  };
}

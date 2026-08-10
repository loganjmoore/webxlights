import type { ModelGeometry, ModelNode } from "./types";

export interface WindowFrameParams {
  top: number;
  leftRight: number; // per side
  bottom: number;
  direction?: "Clockwise" | "Counter Clockwise"; // default Clockwise
}

// SPEC ch4: nodes = top + 2*side + bottom, wired around the frame perimeter starting
// Top Left. Buffer: single wiring line (perimeter order feeds effects; screen coords trace
// the actual rectangle for the 2D layout).
export function computeWindowFrame(params: WindowFrameParams): ModelGeometry {
  const { top, leftRight, bottom } = params;
  const clockwise = (params.direction ?? "Clockwise") === "Clockwise";
  const total = top + leftRight * 2 + bottom;
  const nodes: ModelNode[] = [];
  let i = 0;

  const push = (screenX: number, screenY: number) => {
    nodes.push({ bufX: i, bufY: 0, screenX, screenY, string: 0, indexInString: i });
    i++;
  };

  // Clockwise from top-left: across the top, down the right side, back across the bottom,
  // up the left side.
  for (let n = 0; n < top; n++) push(n, leftRight);
  for (let n = 0; n < leftRight; n++) push(top - 1, leftRight - 1 - n);
  for (let n = 0; n < bottom; n++) push(top - 1 - n, 0);
  for (let n = 0; n < leftRight; n++) push(0, n);

  if (!clockwise) nodes.reverse().forEach((n, idx) => (n.indexInString = idx));
  return { width: total, height: 1, nodes };
}

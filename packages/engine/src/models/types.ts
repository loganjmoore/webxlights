// bufX/bufY: origin bottom-left, feeds effect rendering (SPEC ch4 §10).
// screenX/screenY: relative layout position in "model-local" units for the 2D canvas.
export interface ModelNode {
  bufX: number;
  bufY: number;
  screenX: number;
  screenY: number;
  string: number;
  indexInString: number;
}

export interface ModelGeometry {
  width: number;
  height: number;
  nodes: ModelNode[];
}

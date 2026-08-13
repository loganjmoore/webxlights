// bufX/bufY: origin bottom-left, feeds effect rendering (SPEC ch4 §10).
// screenX/screenY/screenZ: relative layout position in "model-local" units (units.ts - one
// unit is the spacing between adjacent nodes). Most props are flat against a wall or lawn and
// leave screenZ undefined (treated as 0); the ones that genuinely wrap - a 360-degree mega
// tree, above all - carry real depth here rather than faking it as a Y offset, which is what
// made a cone render as a filled triangle.
export interface ModelNode {
  bufX: number;
  bufY: number;
  screenX: number;
  screenY: number;
  screenZ?: number;
  string: number;
  indexInString: number;
}

export interface ModelGeometry {
  width: number;
  height: number;
  nodes: ModelNode[];
}

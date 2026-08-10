export interface MatrixNode {
  bufX: number;
  bufY: number;
  string: number;
  indexInString: number;
}

export interface MatrixGeometry {
  width: number;
  height: number;
  nodes: MatrixNode[];
}

export interface MatrixParams {
  strings: number;
  nodesPerString: number;
}

// ponytail: Vertical / Top Left / zigzag-on / strandsPerString=1 only (the MatrixModel default).
// Horizontal, other starting corners, Don't Zig Zag, Alternate Nodes, and Strands/String > 1
// land in M1's full 12-model geometry pass against SPEC ch4 (MatrixModel.cpp InitVMatrix/InitHMatrix).
export function computeVerticalMatrixTopLeft(params: MatrixParams): MatrixGeometry {
  const { strings: width, nodesPerString: height } = params;
  const nodes: MatrixNode[] = [];
  for (let s = 0; s < width; s++) {
    const topToBottom = s % 2 === 0; // serpentine zigzag wiring
    for (let n = 0; n < height; n++) {
      const bufY = topToBottom ? height - 1 - n : n;
      nodes.push({ bufX: s, bufY, string: s, indexInString: n });
    }
  }
  return { width, height, nodes };
}

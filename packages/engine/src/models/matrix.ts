import type { ModelGeometry, ModelNode } from "./types";

export interface MatrixParams {
  strings: number;
  nodesPerString: number;
  /**
   * Folds per string (StrandsPerString / parm3), default 1.
   *
   * MatrixModel::InitVMatrix:
   *     int NumStrands = _numStrings * _strandsPerString;
   *     int PixelsPerStrand = _nodesPerString / _strandsPerString;
   *     SetBufferSize(PixelsPerStrand, NumStrands);
   *
   * so a folded string becomes several columns, each a fraction as tall - the same rule the Tree
   * follows, because the Tree is a Matrix subclass. Ignoring it gets the buffer's shape wrong,
   * which for a matrix is the whole model: a 16 x 100 panel with 4 strands is 64 wide and 25
   * tall, not 16 wide and 100 tall.
   */
  strandsPerString?: number;
  /**
   * A horizontal matrix runs its strings across rather than up (`DisplayAs="Horiz Matrix"`),
   * which transposes the buffer.
   */
  horizontal?: boolean;
}

// ponytail: Top Left / zigzag-on only. Other starting corners, Don't Zig Zag and Alternate Nodes
// are a documented ceiling; add when a real imported model needs them. Vertical/horizontal and
// Strands/String are here, because real files use both and a matrix with either one wrong is the
// wrong shape rather than merely the wrong wiring.
export function computeVerticalMatrixTopLeft(params: MatrixParams): ModelGeometry {
  // A string that folds becomes `strandsPerString` columns of `nodesPerString / strandsPerString`
  // nodes. Only folded when it divides evenly - xLights derives nodes-per-string from the fold
  // count so real files always do, and dropping a remainder would move every channel after this
  // model.
  const strands = Math.max(Math.trunc(params.strandsPerString ?? 1), 1);
  const folds = strands > 1 && params.nodesPerString % strands === 0 ? strands : 1;
  const width = params.strings * folds;
  const height = params.nodesPerString / folds;

  const nodes: ModelNode[] = [];
  for (let s = 0; s < width; s++) {
    const topToBottom = s % 2 === 0; // serpentine zigzag wiring
    for (let n = 0; n < height; n++) {
      const bufY = topToBottom ? height - 1 - n : n;
      // A horizontal matrix is the same buffer read across instead of up: strings run left to
      // right, so what was a column becomes a row. Transposing here rather than in a second
      // function keeps one wiring rule for both.
      const [screenX, screenY] = params.horizontal ? [bufY, s] : [s, bufY];
      nodes.push({ bufX: s, bufY, screenX, screenY, string: s, indexInString: n });
    }
  }
  return { width, height, nodes };
}

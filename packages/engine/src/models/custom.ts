import type { ModelGeometry, ModelNode } from "./types";

// SPEC ch4: attr `CustomModel` = layers joined by "|", rows by ";", columns by ",";
// each cell blank or the 1-based node number. Duplicate node numbers = same node at
// multiple coords (only the first occurrence becomes that node's canonical position here).
// ponytail: the compressed `CustomModelCompressed` variant ("node,row,col[,layer];...")
// is a later ceiling — vendor exports commonly use the plain grid format.
export function parseCustomModelGrid(data: string): ModelGeometry {
  const layers = data.split("|");
  const nodeMap = new Map<number, ModelNode>();
  let width = 0;
  let height = 0;

  layers.forEach((layerStr, layer) => {
    const rows = layerStr.split(";");
    height = Math.max(height, rows.length);
    rows.forEach((rowStr, row) => {
      const cells = rowStr.split(",");
      width = Math.max(width, cells.length);
      cells.forEach((cell, col) => {
        const trimmed = cell.trim();
        if (trimmed === "") return;
        const nodeNum = parseInt(trimmed, 10);
        if (!Number.isFinite(nodeNum) || nodeNum < 1) return;
        if (!nodeMap.has(nodeNum)) {
          nodeMap.set(nodeNum, {
            bufX: col,
            bufY: rows.length - 1 - row,
            screenX: col,
            screenY: rows.length - 1 - row,
            string: layer,
            indexInString: nodeNum - 1,
          });
        }
      });
    });
  });

  const nodes = [...nodeMap.entries()].sort((a, b) => a[0] - b[0]).map(([, node]) => node);
  return { width, height, nodes };
}

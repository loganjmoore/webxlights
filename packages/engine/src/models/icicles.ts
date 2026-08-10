import type { ModelGeometry, ModelNode } from "./types";

export interface IciclesParams {
  strings: number;
  nodesPerString: number;
  dropPattern?: number[]; // e.g. [3,4,5,4], repeats until nodes are exhausted; default [nodesPerString]
}

// SPEC ch4: total = strings x nodesPerString, distributed per repeating Drop Pattern.
// Buffer width = number of drops, height = max drop size.
export function computeIcicles(params: IciclesParams): ModelGeometry {
  const total = params.strings * params.nodesPerString;
  const pattern = params.dropPattern && params.dropPattern.length > 0 ? params.dropPattern : [params.nodesPerString];

  const nodes: ModelNode[] = [];
  let remaining = total;
  let dropIdx = 0;
  let globalIdx = 0;
  while (remaining > 0) {
    const dropSize = Math.min(pattern[dropIdx % pattern.length]!, remaining);
    for (let n = 0; n < dropSize; n++) {
      nodes.push({ bufX: dropIdx, bufY: dropSize - 1 - n, screenX: dropIdx, screenY: -n, string: 0, indexInString: globalIdx });
      globalIdx++;
    }
    remaining -= dropSize;
    dropIdx++;
  }
  const width = dropIdx;
  const height = Math.max(...pattern);
  return { width, height, nodes };
}

import type { ModelGeometry, ModelNode } from "./types";

// xLights SubModels (manual: Layout Tab > SubModels). A sub-model is a *named subset of a
// parent model's nodes* that appears in the sequencer as its own row, so effects can be put on
// the star at the top of a mega tree, or on one arch of a set, without touching the rest.
//
// This is the piece real sequences lean on hardest. A show that sequences its sub-models and is
// imported without them doesn't merely lose detail - those rows have nowhere to land, so whole
// passages of the sequence render on nothing.
//
// The parent's nodes are shared, not copied: a sub-model node keeps its screenX/screenY, so it
// lights up in the same place in the yard. Only the buffer coordinates are rebuilt, because the
// sub-model has a buffer of its own - which is the whole point of it being a separate row.

export type SubModelType = "ranges" | "subbuffer";

export interface SubModelSpec {
  name: string;
  type: SubModelType;
  /** One entry per row, each a node-range list in xLights' own notation: "1-5,9,12-14". */
  rows: string[];
  /** "x1,y1,x2,y2" as percentages of the parent buffer, for a sub-buffer sub-model. */
  subBuffer?: string;
  vertical?: boolean;
}

/**
 * Parses xLights' node-range notation into zero-based node indices.
 *
 * The notation is one-based and inclusive at both ends, and a descending range like "9-5" is
 * meaningful rather than a mistake: it reverses the node order, which is how a sub-model is made
 * to run the other way along a string.
 */
export function parseNodeRanges(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const dash = piece.indexOf("-", piece.startsWith("-") ? 1 : 0);
    if (dash > 0) {
      const from = parseInt(piece.slice(0, dash), 10);
      const to = parseInt(piece.slice(dash + 1), 10);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      if (from <= to) for (let n = from; n <= to; n++) out.push(n - 1);
      else for (let n = from; n >= to; n--) out.push(n - 1);
    } else {
      const n = parseInt(piece, 10);
      if (Number.isFinite(n)) out.push(n - 1);
    }
  }
  return out.filter((n) => n >= 0);
}

/**
 * Builds a sub-model's geometry from its parent's.
 *
 * Returns null when the spec selects no node the parent actually has - an out-of-range sub-model
 * is better dropped than rendered as an empty row that silently swallows the effects put on it.
 */
export function computeSubModelGeometry(parent: ModelGeometry, spec: SubModelSpec): ModelGeometry | null {
  return computeSubModel(parent, spec)?.geometry ?? null;
}

export interface ResolvedSubModel {
  geometry: ModelGeometry;
  /**
   * Which node of the parent each of this sub-model's nodes is, in the same order.
   *
   * A sub-model doesn't own lights, it borrows its parent's, so anything rendered on it has to
   * be written back to the parent's nodes to reach the yard at all. This is that mapping.
   */
  parentIndices: number[];
}

export function computeSubModel(parent: ModelGeometry, spec: SubModelSpec): ResolvedSubModel | null {
  if (spec.type === "subbuffer") return subBufferSubModel(parent, spec);

  const rows = spec.rows.map(parseNodeRanges).filter((r) => r.length > 0);
  if (rows.length === 0) return null;

  const nodes: ModelNode[] = [];
  const parentIndices: number[] = [];
  const longest = Math.max(...rows.map((r) => r.length));
  rows.forEach((row, rowIndex) => {
    row.forEach((nodeIndex, position) => {
      const source = parent.nodes[nodeIndex];
      if (!source) return; // the range named a node this model doesn't have
      parentIndices.push(nodeIndex);
      nodes.push({
        ...source,
        // A vertical sub-model runs its rows down the buffer instead of across it, which is how
        // xLights makes, say, each column of a matrix into one sub-model row.
        bufX: spec.vertical ? rowIndex : position,
        bufY: spec.vertical ? position : rowIndex,
        string: rowIndex,
        indexInString: position,
      });
    });
  });
  if (nodes.length === 0) return null;

  return {
    geometry: {
      width: spec.vertical ? rows.length : longest,
      height: spec.vertical ? longest : rows.length,
      nodes,
    },
    parentIndices,
  };
}

// A sub-buffer sub-model selects a rectangle of the parent's *buffer* rather than a list of
// nodes, so which nodes it contains follows from where they already sit in that buffer.
function subBufferSubModel(parent: ModelGeometry, spec: SubModelSpec): ResolvedSubModel | null {
  const parts = (spec.subBuffer ?? "").split(",").map((p) => parseFloat(p.trim()));
  if (parts.length < 4 || parts.some((p) => !Number.isFinite(p))) return null;
  const [x1 = 0, y1 = 0, x2 = 100, y2 = 100] = parts;

  const left = Math.round((Math.min(x1, x2) / 100) * (parent.width - 1));
  const right = Math.round((Math.max(x1, x2) / 100) * (parent.width - 1));
  const bottom = Math.round((Math.min(y1, y2) / 100) * (parent.height - 1));
  const top = Math.round((Math.max(y1, y2) / 100) * (parent.height - 1));

  const nodes: ModelNode[] = [];
  const parentIndices: number[] = [];
  parent.nodes.forEach((n, i) => {
    if (n.bufX < left || n.bufX > right || n.bufY < bottom || n.bufY > top) return;
    parentIndices.push(i);
    nodes.push({ ...n, bufX: n.bufX - left, bufY: n.bufY - bottom });
  });
  if (nodes.length === 0) return null;

  return { geometry: { width: right - left + 1, height: top - bottom + 1, nodes }, parentIndices };
}

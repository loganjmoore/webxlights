import type { ModelGeometry } from "./types";
import type { SubModelSpec } from "./subModel";

// Strands (manual: Sequencer > Layers, and the model pages).
//
// "To add layers at the strand level, click on the Model name in the sequencer to display the
// Strand names. Then right click on the strand name and choose Add Layer above or below the
// selected strand." And: "The strands blend onto the model level effects."
//
// A strand is one string of a multi-string prop - the physical run of lights, not a user-defined
// sub-model. Every model already carries the distinction: each node knows its `string` and its
// `indexInString`. So a strand needs no new geometry code, only a name and a node range, and it
// resolves through exactly the same path a sub-model does - including the parentIndices writeback
// that lets anything rendered on it reach the yard.
//
// Deriving them rather than storing them is the point. Strands are a fact about the model's wiring:
// a stored copy would go stale the moment someone changed the string count, and the symptom would
// be effects rendering onto lights that had moved.

/** The strand numbers a model has, in order. */
export function strandNumbers(geometry: ModelGeometry): number[] {
  return [...new Set(geometry.nodes.map((n) => n.string))].sort((a, b) => a - b);
}

/**
 * How many strands a model has.
 *
 * One for a prop wired as a single run, which is most of them - and a single-strand model is worth
 * showing as such rather than hiding, since "this prop has one strand" is a real answer.
 */
export function strandCount(geometry: ModelGeometry): number {
  return strandNumbers(geometry).length;
}

/** xLights names them by number, and so does the sequencer row this ends up on. */
export function strandName(strandNumber: number): string {
  return `Strand ${strandNumber + 1}`;
}

/**
 * A strand as a sub-model spec.
 *
 * Node ranges are one-based and inclusive, which is the notation `parseNodeRanges` reads and the
 * one the sub-model editor shows - so a strand is expressible in exactly the terms a hand-written
 * sub-model is, and anyone who wants to start from one can copy it.
 *
 * Nodes are listed in `indexInString` order rather than in the parent's array order: the run is
 * what a chase travels along, and a strand whose nodes came out shuffled would render a chase as
 * noise.
 */
export function strandSpec(geometry: ModelGeometry, strandNumber: number): SubModelSpec | null {
  const indices = geometry.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.string === strandNumber)
    .sort((a, b) => a.node.indexInString - b.node.indexInString)
    .map(({ index }) => index + 1);

  if (indices.length === 0) return null;
  return { name: strandName(strandNumber), type: "ranges", rows: [compressRanges(indices)] };
}

/** Every strand of a model, in order. */
export function strandSpecs(geometry: ModelGeometry): SubModelSpec[] {
  return strandNumbers(geometry)
    .map((n) => strandSpec(geometry, n))
    .filter((s): s is SubModelSpec => s !== null);
}

/**
 * One-based indices as the shortest range notation that reads back the same.
 *
 * Written out rather than left as a comma list because a 500-node strand's spec is otherwise a
 * paragraph, and this is a string a person may well end up looking at in the sub-model editor.
 * Only *ascending* runs are collapsed: a descending pair means "reverse the node order" in this
 * notation, so collapsing one would change what the spec says.
 */
function compressRanges(indices: number[]): string {
  const parts: string[] = [];
  let runStart = indices[0]!;
  let previous = runStart;

  for (let i = 1; i <= indices.length; i++) {
    const current = indices[i];
    if (current !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }
    parts.push(runStart === previous ? `${runStart}` : `${runStart}-${previous}`);
    if (current === undefined) break;
    runStart = current;
    previous = current;
  }
  return parts.join(",");
}

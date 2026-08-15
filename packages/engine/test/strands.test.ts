import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeSubModel } from "../src/models/subModel";
import { strandCount, strandName, strandNumbers, strandSpec, strandSpecs } from "../src/models/strands";

const matrix = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 4 });

describe("the strands a model has", () => {
  it("is one per string of the prop", () => {
    expect(strandCount(matrix)).toBe(3);
    expect(strandNumbers(matrix)).toEqual([0, 1, 2]);
  });

  it("names them the way xLights does", () => {
    expect(strandName(0)).toBe("Strand 1");
  });

  it("counts a single-run prop as having one strand", () => {
    // Worth showing rather than hiding: "this prop has one strand" is a real answer.
    const line = computeVerticalMatrixTopLeft({ strings: 1, nodesPerString: 10 });
    expect(strandCount(line)).toBe(1);
  });
});

describe("a strand as a sub-model spec", () => {
  it("selects exactly that string's nodes", () => {
    const spec = strandSpec(matrix, 1)!;
    const resolved = computeSubModel(matrix, spec)!;
    expect(resolved.geometry.nodes).toHaveLength(4);
    for (const index of resolved.parentIndices) {
      expect(matrix.nodes[index]!.string).toBe(1);
    }
  });

  it("lists the nodes along the run, in order", () => {
    // A strand is the physical run a chase travels along; nodes out of order would render a chase
    // as noise.
    const spec = strandSpec(matrix, 0)!;
    const resolved = computeSubModel(matrix, spec)!;
    const order = resolved.parentIndices.map((i) => matrix.nodes[i]!.indexInString);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("writes the range in the notation the sub-model editor reads", () => {
    // So a strand is expressible in exactly the terms a hand-written sub-model is, and anyone who
    // wants to start from one can copy it.
    const spec = strandSpec(matrix, 0)!;
    expect(spec.rows[0]).toMatch(/^\d+(-\d+)?(,\d+(-\d+)?)*$/);
    expect(spec.type).toBe("ranges");
  });

  it("compresses a contiguous run rather than listing every node", () => {
    // A 500-node strand would otherwise be a paragraph, and this is a string a person may well
    // end up reading in the sub-model editor.
    const line = computeVerticalMatrixTopLeft({ strings: 1, nodesPerString: 6 });
    expect(strandSpec(line, 0)!.rows[0]).toBe("1-6");
  });

  it("is nothing for a strand the model doesn't have", () => {
    expect(strandSpec(matrix, 9)).toBeNull();
  });

  it("covers every node of the model exactly once, across all strands", () => {
    // The property that makes strands safe to render: no light belongs to two strands, and none
    // is left out, so strand rows can't double-light or silently drop part of a prop.
    const seen = new Set<number>();
    for (const spec of strandSpecs(matrix)) {
      for (const index of computeSubModel(matrix, spec)!.parentIndices) {
        expect(seen.has(index), `node ${index} is in two strands`).toBe(false);
        seen.add(index);
      }
    }
    expect(seen.size).toBe(matrix.nodes.length);
  });
});

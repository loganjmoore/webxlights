import { describe, expect, it } from "vitest";
import { computeSubModelGeometry, parseNodeRanges } from "../src/models/subModel";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeSingleLine } from "../src/models/line";

const LINE = computeSingleLine({ strings: 1, nodesPerString: 20 });
const MATRIX = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 5 });

describe("xLights node-range notation", () => {
  it("is one-based and inclusive at both ends", () => {
    expect(parseNodeRanges("1-5")).toEqual([0, 1, 2, 3, 4]);
    expect(parseNodeRanges("3")).toEqual([2]);
  });

  it("takes a comma-separated list in the order written", () => {
    expect(parseNodeRanges("9,1-3,7")).toEqual([8, 0, 1, 2, 6]);
  });

  it("reverses a descending range rather than treating it as a mistake", () => {
    // That is how a sub-model is made to run the other way along a string, so dropping it
    // would quietly reverse someone's chase.
    expect(parseNodeRanges("5-1")).toEqual([4, 3, 2, 1, 0]);
  });

  it("ignores blanks and nonsense instead of producing negative indices", () => {
    expect(parseNodeRanges("")).toEqual([]);
    expect(parseNodeRanges(" , ,")).toEqual([]);
    expect(parseNodeRanges("abc")).toEqual([]);
    expect(parseNodeRanges("0")).toEqual([]); // one-based, so 0 names nothing
  });
});

describe("SubModel geometry", () => {
  it("selects the named nodes and gives them a buffer of their own", () => {
    const sub = computeSubModelGeometry(LINE, { name: "Top", type: "ranges", rows: ["1-5"] })!;
    expect(sub.nodes).toHaveLength(5);
    expect([sub.width, sub.height]).toEqual([5, 1]);
    expect(sub.nodes.map((n) => n.bufX)).toEqual([0, 1, 2, 3, 4]);
  });

  it("shares the parent's nodes rather than copying them elsewhere in the yard", () => {
    // A sub-model is a different way of *addressing* the same lights, so its nodes have to keep
    // their physical position - only the buffer coordinates are rebuilt.
    const sub = computeSubModelGeometry(LINE, { name: "Mid", type: "ranges", rows: ["6-10"] })!;
    expect(sub.nodes.map((n) => n.screenX)).toEqual([5, 6, 7, 8, 9]);
  });

  it("gives each row of the spec its own buffer row", () => {
    const sub = computeSubModelGeometry(MATRIX, { name: "Two", type: "ranges", rows: ["1-5", "6-10"] })!;
    expect([sub.width, sub.height]).toEqual([5, 2]);
    expect(sub.nodes.filter((n) => n.bufY === 0)).toHaveLength(5);
    expect(sub.nodes.filter((n) => n.bufY === 1)).toHaveLength(5);
  });

  it("runs the rows down the buffer when the sub-model is vertical", () => {
    const sub = computeSubModelGeometry(MATRIX, { name: "V", type: "ranges", rows: ["1-5", "6-10"], vertical: true })!;
    expect([sub.width, sub.height]).toEqual([2, 5]);
  });

  it("keeps a reversed range reversed in the buffer", () => {
    const sub = computeSubModelGeometry(LINE, { name: "Back", type: "ranges", rows: ["5-1"] })!;
    expect(sub.nodes.map((n) => n.screenX)).toEqual([4, 3, 2, 1, 0]);
    expect(sub.nodes.map((n) => n.bufX)).toEqual([0, 1, 2, 3, 4]);
  });

  it("drops a sub-model that selects nothing, rather than making an empty row", () => {
    // An empty row would silently swallow every effect put on it.
    expect(computeSubModelGeometry(LINE, { name: "None", type: "ranges", rows: [] })).toBeNull();
    expect(computeSubModelGeometry(LINE, { name: "None", type: "ranges", rows: [""] })).toBeNull();
    expect(computeSubModelGeometry(LINE, { name: "Off", type: "ranges", rows: ["900-905"] })).toBeNull();
  });

  it("skips node numbers the parent doesn't have but keeps the ones it does", () => {
    const sub = computeSubModelGeometry(LINE, { name: "Edge", type: "ranges", rows: ["18-25"] })!;
    expect(sub.nodes).toHaveLength(3); // 18, 19, 20 exist; 21-25 don't
  });

  it("a sub-buffer sub-model takes a rectangle of the parent's buffer", () => {
    const sub = computeSubModelGeometry(MATRIX, { name: "Half", type: "subbuffer", rows: [], subBuffer: "0,0,100,50" })!;
    expect(sub.height).toBeLessThan(MATRIX.height);
    expect(sub.nodes.length).toBeLessThan(MATRIX.nodes.length);
    expect(sub.nodes.every((n) => n.bufY >= 0 && n.bufY < sub.height)).toBe(true);
  });

  it("rejects a malformed sub-buffer instead of guessing at it", () => {
    expect(computeSubModelGeometry(MATRIX, { name: "Bad", type: "subbuffer", rows: [], subBuffer: "0,0" })).toBeNull();
    expect(computeSubModelGeometry(MATRIX, { name: "Bad", type: "subbuffer", rows: [] })).toBeNull();
  });
});

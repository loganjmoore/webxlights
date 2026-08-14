import { describe, expect, it } from "vitest";
import { digitStatesFor, findState, nodesForState, sevenSegmentStateNames, stateIndex } from "../src/models/states";

const ENTRIES = [
  { name: "eyesleft", nodes: "1,5,8" },
  { name: "wink", nodes: "1-3,8" },
  { name: "Colon", nodes: "20" },
];

describe("model state definitions", () => {
  it("turns a state's node ranges into zero-based node indices", () => {
    expect(nodesForState(ENTRIES, "eyesleft")).toEqual([0, 4, 7]);
    expect(nodesForState(ENTRIES, "wink")).toEqual([0, 1, 2, 7]);
  });

  it("matches a label to a state regardless of case or surrounding space", () => {
    expect(findState(ENTRIES, " EyesLeft ")?.nodes).toBe("1,5,8");
    expect(stateIndex(ENTRIES, "COLON")).toBe(2);
  });

  it("renders nothing for a label no state defines", () => {
    // A lyric track shared with a Faces effect is full of words that aren't states. The manual's
    // own advice is "ensure that the text exactly matches one of the states defined".
    expect(nodesForState(ENTRIES, "blink")).toEqual([]);
    expect(stateIndex(ENTRIES, "blink")).toBe(-1);
  });
});

describe("seven segment numbers", () => {
  it("spells a number the way the manual tells you to type it", () => {
    // "In the default mode, if you wish to turn on the number '123', then you would specify
    // '100,20,3' (without quotes) in the label on the timing grid."
    expect(digitStatesFor(123)).toEqual(["100", "20", "3"]);
  });

  it("lights the zeros to the right of the leading digit", () => {
    // 100 has to light all three digits or the sign reads as a bare "1".
    expect(digitStatesFor(100)).toEqual(["100", "00", "0"]);
    expect(digitStatesFor(0)).toEqual(["0"]);
  });

  it("offers the predefined names a display needs, per place", () => {
    const names = sevenSegmentStateNames(4);
    expect(names).toContain("0");
    expect(names).toContain("9");
    expect(names).toContain("00");
    expect(names).toContain("90");
    expect(names).toContain("900");
    expect(names).toContain("9000");
    expect(names).toContain("Colon");
    expect(names).toContain("Dot");
    // Every state a four-digit sign can show, and no duplicates.
    expect(new Set(names).size).toBe(names.length);
  });
});

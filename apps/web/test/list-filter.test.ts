import { describe, expect, it } from "vitest";
import { filterRanked, isDefaultStrandName, matchRank } from "../src/lib/listFilter";

const names = ["Street Lights", "Mega Tree", "Tree", "Garage Matrix", "Roof Custom", "Strand 3"];

describe("typeahead ranking", () => {
  it("puts the exact name first, then the ones that start with it, then the rest", () => {
    expect(filterRanked(names, "tree", (n) => n)).toEqual(["Tree", "Mega Tree", "Street Lights"]);
  });
  it("finds a name by its initials in order", () => {
    expect(matchRank("Garage Matrix", "gmx")).toBe("subsequence");
    expect(matchRank("Garage Matrix", "xg")).toBeNull();
  });
  it("ignores case and surrounding space", () => {
    expect(matchRank("Roof Custom", "  ROOF ")).toBe("prefix");
  });
  it("returns the list untouched for an empty query", () => {
    expect(filterRanked(names, "  ", (n) => n)).toEqual(names);
  });
});

describe("default strand names", () => {
  it("knows a numbered strand from a named one", () => {
    expect(isDefaultStrandName("Strand 12")).toBe(true);
    expect(isDefaultStrandName("strand3")).toBe(true);
    expect(isDefaultStrandName("Left Eave")).toBe(false);
    expect(isDefaultStrandName("Strand A")).toBe(false);
  });
});

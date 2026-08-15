import { describe, expect, it } from "vitest";
import type { SequenceEffect } from "../src/lib/api";
import { describeCriteria, matchingEffectIds, type CandidateRow } from "../src/lib/selectEffects";

function effect(id: string, name: string, startMs: number, endMs: number): SequenceEffect {
  return { id, name, startMs, endMs, params: {} };
}

const rows: CandidateRow[] = [
  { key: "model:1:", effects: [effect("a", "Fire", 0, 1000), effect("b", "Bars", 2000, 3000)] },
  { key: "model:2:", effects: [effect("c", "Fire", 2500, 4000)] },
  { key: "model:3:", effects: [] },
];

describe("selecting by criteria", () => {
  it("takes everything when nothing is asked for", () => {
    expect(matchingEffectIds(rows, {})).toEqual(["a", "b", "c"]);
  });

  it("selects by effect type", () => {
    // "Every Fire in the show" is the selection a bulk edit is for, and a box only finds it when
    // the effects happen to be adjacent on screen.
    expect(matchingEffectIds(rows, { name: "Fire" })).toEqual(["a", "c"]);
  });

  it("selects by row", () => {
    expect(matchingEffectIds(rows, { rowKeys: ["model:1:"] })).toEqual(["a", "b"]);
  });

  it("selects by time, counting anything that overlaps", () => {
    // An effect running through the chorus is part of the chorus. Requiring it to start and end
    // inside would miss the long pad, which is usually the thing being looked for.
    expect(matchingEffectIds(rows, { fromMs: 2600, toMs: 2800 })).toEqual(["b", "c"]);
  });

  it("treats a touching edge as outside the window", () => {
    // The same rule the selection box and the collision test use.
    expect(matchingEffectIds(rows, { fromMs: 1000, toMs: 2000 })).toEqual([]);
  });

  it("combines criteria with and", () => {
    expect(matchingEffectIds(rows, { name: "Fire", rowKeys: ["model:2:"] })).toEqual(["c"]);
    expect(matchingEffectIds(rows, { name: "Fire", fromMs: 0, toMs: 500 })).toEqual(["a"]);
  });

  it("finds nothing rather than everything when a criterion matches nothing", () => {
    // The dangerous failure would be a criterion that silently widens the selection.
    expect(matchingEffectIds(rows, { name: "Nonexistent" })).toEqual([]);
    expect(matchingEffectIds(rows, { rowKeys: ["model:9:"] })).toEqual([]);
  });

  it("ignores an empty name or empty row list as 'any'", () => {
    expect(matchingEffectIds(rows, { name: "  ", rowKeys: [] })).toEqual(["a", "b", "c"]);
  });
});

describe("saying what will be selected", () => {
  it("reads as a sentence", () => {
    // The panel's whole risk is selecting more than you meant and then bulk-editing it.
    expect(describeCriteria({}, 3)).toBe("every effect, on every row, in the whole sequence");
    expect(describeCriteria({ name: "Fire", rowKeys: ["model:1:"], fromMs: 0, toMs: 10 }, 3)).toBe(
      "every Fire, on 1 of 3 rows, in the marked range",
    );
  });
});

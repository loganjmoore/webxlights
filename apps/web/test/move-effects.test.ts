import { describe, expect, it } from "vitest";
import type { SequenceEffect } from "../src/lib/api";
import { fitsOnRow, moveEffectInTime, moveEffectToRow } from "../src/lib/moveEffects";

function effect(id: string, startMs: number, endMs: number): SequenceEffect {
  return { id, name: "On", startMs, endMs, params: {} };
}

const DURATION = 10_000;

describe("moving an effect along its row", () => {
  it("nudges it by the step", () => {
    const effects = [effect("a", 1000, 2000)];
    expect(moveEffectInTime(effects, "a", 1, 100, DURATION)).toEqual({ startMs: 1100, endMs: 2100 });
    expect(moveEffectInTime(effects, "a", -1, 100, DURATION)).toEqual({ startMs: 900, endMs: 1900 });
  });

  it("jumps over a blocking effect rather than stopping at it", () => {
    // "When the effect encounters or is blocked by another effect, if you keep going, it will jump
    // over the effect/effects and continue past." Stopping dead would make the keyboard useless
    // exactly where it is most wanted - a row packed with effects.
    const effects = [effect("a", 1000, 2000), effect("b", 2050, 3000)];
    expect(moveEffectInTime(effects, "a", 1, 100, DURATION)).toEqual({ startMs: 3000, endMs: 4000 });
  });

  it("jumps over several packed effects as a group", () => {
    const effects = [effect("a", 1000, 2000), effect("b", 2050, 3000), effect("c", 3000, 3500)];
    expect(moveEffectInTime(effects, "a", 1, 100, DURATION)).toEqual({ startMs: 3500, endMs: 4500 });
  });

  it("jumps backwards too", () => {
    const effects = [effect("a", 3000, 4000), effect("b", 2000, 2950)];
    expect(moveEffectInTime(effects, "a", -1, 100, DURATION)).toEqual({ startMs: 1000, endMs: 2000 });
  });

  it("butts up against a neighbour rather than jumping it when the step still fits", () => {
    // Only a *blocked* move jumps. A step that lands short of the neighbour just lands there,
    // which is what makes the arrow keys usable for nudging two effects together.
    const effects = [effect("a", 0, 500), effect("b", 600, 1100)];
    expect(moveEffectInTime(effects, "a", 1, 100, DURATION)).toEqual({ startMs: 100, endMs: 600 });
  });

  it("jumps into the gap beyond a blocker when the step no longer fits", () => {
    const effects = [effect("a", 100, 600), effect("b", 600, 1100), effect("c", 1600, 2000)];
    // Now the step overlaps `b`, so it jumps past it and lands in the gap before `c`.
    expect(moveEffectInTime(effects, "a", 1, 100, DURATION)).toEqual({ startMs: 1100, endMs: 1600 });
  });

  it("refuses to move off the front or past the end", () => {
    // Null rather than clamping: "there is nowhere to go" should leave the effect where it is,
    // not stack it against the edge.
    expect(moveEffectInTime([effect("a", 0, 500)], "a", -1, 100, DURATION)).toBeNull();
    expect(moveEffectInTime([effect("a", 9600, 10_000)], "a", 1, 100, DURATION)).toBeNull();
  });

  it("returns null for an effect that isn't there", () => {
    expect(moveEffectInTime([], "missing", 1, 100, DURATION)).toBeNull();
  });
});

describe("moving an effect between rows", () => {
  const rows = [
    { elementType: "model" as const, elementId: 1 },
    { elementType: "model" as const, elementId: 2 },
    { elementType: "submodel" as const, elementId: 2, subName: "Star" },
  ];

  it("moves to the next row down and back up", () => {
    expect(moveEffectToRow(rows, rows[0]!, 1)).toEqual(rows[1]);
    expect(moveEffectToRow(rows, rows[1]!, -1)).toEqual(rows[0]);
  });

  it("tells a sub-model row apart from its parent", () => {
    // Same elementId, different row - matching on the id alone would move an effect onto itself.
    expect(moveEffectToRow(rows, rows[1]!, 1)).toEqual(rows[2]);
    expect(moveEffectToRow(rows, rows[2]!, -1)).toEqual(rows[1]);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(moveEffectToRow(rows, rows[0]!, -1)).toBeNull();
    expect(moveEffectToRow(rows, rows[2]!, 1)).toBeNull();
  });
});

describe("whether a vertical move has somewhere to land", () => {
  it("refuses a slot another effect already occupies", () => {
    // Horizontal moves jump over blockers; a vertical move has nowhere to jump to, so it is
    // refused rather than left overlapping.
    expect(fitsOnRow([effect("x", 900, 1500)], 1000, 2000)).toBe(false);
    expect(fitsOnRow([effect("x", 2000, 2500)], 1000, 2000)).toBe(true);
  });

  it("treats touching edges as fitting", () => {
    // An effect ending exactly where another starts is butted against it, not overlapping it.
    expect(fitsOnRow([effect("x", 2000, 2500)], 1500, 2000)).toBe(true);
  });
});

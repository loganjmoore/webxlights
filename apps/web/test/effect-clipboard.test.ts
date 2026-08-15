import { describe, expect, it } from "vitest";
import type { SequenceEffect } from "../src/lib/api";
import { clipboardFrom, clipboardSize, pastedAt } from "../src/lib/effectClipboard";

function effect(id: string, startMs: number, endMs: number, name = "On"): SequenceEffect {
  return { id, name, startMs, endMs, params: {} };
}

let counter = 0;
const newId = () => `new${++counter}`;

describe("copying a block", () => {
  it("stores positions relative to the earliest effect and topmost row", () => {
    // Absolute times would only ever paste back where they came from.
    const clip = clipboardFrom([
      { effect: effect("a", 2000, 2500), rowIndex: 1 },
      { effect: effect("b", 3000, 3200), rowIndex: 3 },
    ]);
    expect(clip?.entries.map((e) => ({ offsetMs: e.offsetMs, rowOffset: e.rowOffset }))).toEqual([
      { offsetMs: 0, rowOffset: 0 },
      { offsetMs: 1000, rowOffset: 2 },
    ]);
  });

  it("anchors on the earliest effect however the sources are ordered", () => {
    // Anchoring on the reference effect would make pasting jump backwards whenever the reference
    // wasn't the first one selected.
    const clip = clipboardFrom([
      { effect: effect("late", 5000, 5500), rowIndex: 2 },
      { effect: effect("early", 1000, 1500), rowIndex: 0 },
    ]);
    expect(clip?.entries.find((e) => e.effect.id === "early")?.offsetMs).toBe(0);
    expect(clip?.entries.find((e) => e.effect.id === "late")?.offsetMs).toBe(4000);
  });

  it("is nothing at all for an empty selection", () => {
    expect(clipboardFrom([])).toBeNull();
    expect(clipboardSize(null)).toBe(0);
  });

  it("takes a copy, so editing the original doesn't change what was copied", () => {
    const original = effect("a", 0, 500);
    const clip = clipboardFrom([{ effect: original, rowIndex: 0 }]);
    original.startMs = 9999;
    expect(clip?.entries[0]?.effect.startMs).toBe(0);
  });
});

describe("pasting a block", () => {
  const clip = clipboardFrom([
    { effect: effect("a", 2000, 2500), rowIndex: 1 },
    { effect: effect("b", 3000, 3200), rowIndex: 3 },
  ])!;

  it("puts the block's corner where it was pasted and keeps its shape", () => {
    const pasted = pastedAt(clip, 10_000, 0, 8, newId);
    expect(pasted.map((p) => [p.effect.startMs, p.effect.endMs, p.rowIndex])).toEqual([
      [10_000, 10_500, 0],
      [11_000, 11_200, 2],
    ]);
  });

  it("gives every pasted effect a new id", () => {
    const pasted = pastedAt(clip, 0, 0, 8, newId);
    const ids = pasted.map((p) => p.effect.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("a");
  });

  it("keeps everything else about the effect", () => {
    const rich = clipboardFrom([
      { effect: { ...effect("x", 0, 500, "Fire"), params: { speed: 7 }, palette: ["#ff0000"] }, rowIndex: 0 },
    ])!;
    const [pasted] = pastedAt(rich, 1000, 0, 4, newId);
    expect(pasted?.effect.name).toBe("Fire");
    expect(pasted?.effect.params).toEqual({ speed: 7 });
    expect(pasted?.effect.palette).toEqual(["#ff0000"]);
  });

  it("piles onto the last row rather than dropping what would fall off the bottom", () => {
    // Silently losing half a paste looks like the paste having partly failed; effects piled on the
    // last row can at least be seen and moved.
    const pasted = pastedAt(clip, 0, 1, 2, newId);
    expect(pasted.map((p) => p.rowIndex)).toEqual([1, 1]);
  });

  it("never pastes before the start of the sequence", () => {
    const pasted = pastedAt(clip, -5000, 0, 8, newId);
    expect(pasted.every((p) => p.effect.startMs >= 0)).toBe(true);
  });

  it("keeps each effect's own length", () => {
    const pasted = pastedAt(clip, 7777, 0, 8, newId);
    expect(pasted.map((p) => p.effect.endMs - p.effect.startMs)).toEqual([500, 200]);
  });
});

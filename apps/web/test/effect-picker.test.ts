import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft, defaultParamsFor, renderRowAtMs, rgba } from "@webxlights/engine";
import {
  MAX_SAVED_PALETTES,
  MOST_USED_EFFECTS,
  PLACEHOLDER_EFFECT,
  STARTER_PALETTES,
  clonePalette,
  colorUsage,
  effectUsage,
  isPlaceholder,
  keepOrder,
  loadSavedPalettes,
  paletteUsage,
  pickerItems,
  sanitizePalettes,
  saveSavedPalettes,
} from "../src/lib/effectPicker";
import type { SequenceBody, SequenceEffect } from "../src/lib/api";

let nextId = 0;
function effect(name: string, palette?: SequenceEffect["palette"]): SequenceEffect {
  return { id: `e${nextId++}`, name, startMs: 0, endMs: 1000, params: {}, ...(palette ? { palette } : {}) };
}
function bodyOf(...rows: SequenceEffect[][]): SequenceBody {
  return { timingTracks: [], rows: rows.map((effects, i) => ({ elementType: "model", elementId: i + 1, effects })) };
}

const NAMES = ["On", "Off", "Bars", "Butterfly", "Color Wash", "Twinkle", "Spirals", "Fire"];

describe("what a sequence uses most", () => {
  it("counts effects across every row, most used first", () => {
    const body = bodyOf([effect("Bars"), effect("Twinkle"), effect("Bars")], [effect("Bars"), effect("Twinkle"), effect("On")]);
    expect(effectUsage(body)).toEqual([
      { name: "Bars", count: 3 },
      { name: "Twinkle", count: 2 },
      { name: "On", count: 1 },
    ]);
  });

  it("doesn't count placeholders: a span waiting for an effect isn't a vote for one", () => {
    expect(effectUsage(bodyOf([effect(PLACEHOLDER_EFFECT), effect("On")]))).toEqual([{ name: "On", count: 1 }]);
  });

  it("keeps ties in the order they first appear, so the list doesn't reshuffle between edits", () => {
    expect(effectUsage(bodyOf([effect("Twinkle"), effect("Bars")])).map((u) => u.name)).toEqual(["Twinkle", "Bars"]);
  });
});

describe("what the picker lists", () => {
  const usage = [
    { name: "Twinkle", count: 5 },
    { name: "Bars", count: 2 },
  ];

  it("puts the most used first and leaves the rest in the palette's order", () => {
    const items = pickerItems(NAMES, usage, "");
    expect(items.map((i) => i.name)).toEqual(["Twinkle", "Bars", "On", "Off", "Butterfly", "Color Wash", "Spirals", "Fire"]);
    expect(items[0]).toEqual({ name: "Twinkle", count: 5, mostUsed: true });
    expect(items[2]).toEqual({ name: "On", count: 0, mostUsed: false });
  });

  it("lists every effect exactly once", () => {
    expect(pickerItems(NAMES, usage, "").map((i) => i.name).sort()).toEqual([...NAMES].sort());
  });

  it("caps the most used, so a busy sequence doesn't push the rest off the first screen", () => {
    const busy = NAMES.map((name, i) => ({ name, count: 20 - i }));
    expect(pickerItems(NAMES, busy, "").filter((i) => i.mostUsed)).toHaveLength(MOST_USED_EFFECTS);
  });

  it("leaves out names that can't be placed, however often an import used them", () => {
    const items = pickerItems(NAMES, [{ name: "Liquid", count: 40 }, ...usage], "");
    expect(items.map((i) => i.name)).not.toContain("Liquid");
    expect(items[0]!.name).toBe("Twinkle");
  });

  it("ranks a query by how well it matches, and ties by use", () => {
    // Both start with "b"; Bars is the one this sequence reaches for.
    expect(pickerItems(NAMES, usage, "b").map((i) => i.name).slice(0, 2)).toEqual(["Bars", "Butterfly"]);
    // An exact name beats a more used prefix match.
    expect(pickerItems(NAMES, [{ name: "Off", count: 9 }], "on")[0]!.name).toBe("On");
    expect(pickerItems(NAMES, usage, "zzz")).toEqual([]);
  });
});

describe("the colours a sequence uses", () => {
  const curve = { kind: "colorCurve" as const, mode: "Time" as const, blend: "Gradient" as const, points: [{ x: 0, color: "#00FF00" }, { x: 1, color: "#0000ff" }] };
  const body = bodyOf(
    [effect("On", ["#ff0000", "#00ff00"]), effect("Bars", ["#ff0000", "#00ff00"]), effect("Fire", ["#FF0000"])],
    [effect("Twinkle", [curve]), effect("Off")],
  );

  it("counts whole palettes, most used first, ignoring effects on the default", () => {
    expect(paletteUsage(body)).toEqual([
      { palette: ["#ff0000", "#00ff00"], count: 2 },
      { palette: ["#FF0000"], count: 1 },
      { palette: [curve], count: 1 },
    ]);
  });

  it("counts single colours without regard to case, a curve as the colour it starts on", () => {
    expect(colorUsage(body)).toEqual([
      { color: "#ff0000", count: 3 },
      { color: "#00ff00", count: 3 },
    ]);
  });

  it("holds a list still while it is being clicked through, adding what is new to the end", () => {
    const same = (a: string, b: string) => a === b;
    // Using white made it outrank blue; on screen it stays where it was.
    expect(keepOrder(["red", "blue", "white"], ["red", "white", "blue"], same)).toEqual(["red", "blue", "white"]);
    expect(keepOrder(["red", "blue"], ["green", "blue", "red"], same)).toEqual(["red", "blue", "green"]);
    expect(keepOrder(["red", "blue"], ["blue"], same)).toEqual(["blue"]);
    expect(keepOrder([], ["red", "blue"], same)).toEqual(["red", "blue"]);
  });

  it("clones a palette deeply, so an effect never shares a curve with the chip it came from", () => {
    const copy = clonePalette([curve]);
    expect(copy).toEqual([curve]);
    expect(copy[0]).not.toBe(curve);
  });
});

describe("saved palettes", () => {
  function storage(initial?: string) {
    let value = initial;
    return { getItem: () => value ?? null, setItem: (_k: string, v: string) => { value = v; } };
  }

  it("round-trips", () => {
    const store = storage();
    saveSavedPalettes(store, [["#ff0000", "#00ff00"], ["#ffffff"]]);
    expect(loadSavedPalettes(store)).toEqual([["#ff0000", "#00ff00"], ["#ffffff"]]);
  });

  it("starts from the starter palettes when nothing is stored, storage is absent, or the bag is corrupt", () => {
    expect(loadSavedPalettes(storage())).toEqual(STARTER_PALETTES);
    expect(loadSavedPalettes(null)).toEqual(STARTER_PALETTES);
    expect(loadSavedPalettes(storage("{not json"))).toEqual(STARTER_PALETTES);
    // A copy, so forgetting one can't edit the constant every later load starts from.
    expect(loadSavedPalettes(null)[0]).not.toBe(STARTER_PALETTES[0]);
    expect(sanitizePalettes(STARTER_PALETTES)).toEqual(STARTER_PALETTES);
  });

  it("stays empty once emptied: the starters are a first offer, not a floor", () => {
    const store = storage();
    saveSavedPalettes(store, []);
    expect(loadSavedPalettes(store)).toEqual([]);
    expect(loadSavedPalettes(storage('{"a":1}'))).toEqual([]);
  });

  it("drops what isn't a palette, and repeats", () => {
    expect(sanitizePalettes([["#ff0000"], ["red"], [], "nope", [42], ["#ff0000"], Array(9).fill("#000000")])).toEqual([["#ff0000"]]);
  });

  it("keeps the first ones when there are too many, which is why the page saves newest first", () => {
    const many = Array.from({ length: MAX_SAVED_PALETTES + 5 }, (_, i) => [`#${i.toString(16).padStart(6, "0")}`]);
    const kept = sanitizePalettes(many);
    expect(kept).toHaveLength(MAX_SAVED_PALETTES);
    expect(kept[0]).toEqual(["#000000"]);
  });
});

describe("a placeholder", () => {
  it("is told apart by name", () => {
    expect(isPlaceholder({ name: PLACEHOLDER_EFFECT })).toBe(true);
    expect(isPlaceholder({ name: "On" })).toBe(false);
  });

  it("renders nothing, even on a layer above an effect that does", () => {
    // The promise "does nothing" rests on the engine leaving a name it doesn't know transparent.
    // If it ever gains an effect by this name, or starts painting unknown ones, every placeholder
    // in every sequence starts blacking out what is under it.
    const geometry = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
    const on = { name: "On", startMs: 0, endMs: 1000, params: defaultParamsFor("On") };
    const above = { name: PLACEHOLDER_EFFECT, startMs: 0, endMs: 1000, params: {}, layerIndex: 1 };
    const render = (effects: (typeof on)[]) => renderRowAtMs({ geometry, effects }, 500, 50, 1, [rgba(255, 0, 0, 255)]);

    expect(render([above]).every((c) => c.a === 0)).toBe(true);
    expect(render([on, above])).toEqual(render([on]));
    expect(render([on]).some((c) => c.a > 0)).toBe(true);
  });
});

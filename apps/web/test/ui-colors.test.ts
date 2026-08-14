import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_COLORS,
  UI_COLOR_LABELS,
  exportUiColors,
  importUiColors,
  loadUiColors,
  resetUiColors,
  sanitizeColors,
  saveUiColors,
} from "../src/lib/uiColors";

function storage(initial?: string) {
  let value = initial;
  return { getItem: () => value ?? null, setItem: (_k: string, v: string) => { value = v; } };
}

describe("storing the app's colours", () => {
  it("round-trips", () => {
    const store = storage();
    const colors = { ...DEFAULT_UI_COLORS, effect: "#123456" };
    saveUiColors(store, colors);
    expect(loadUiColors(store)).toEqual(colors);
  });

  it("gives the defaults when nothing is stored, or storage is absent", () => {
    expect(loadUiColors(storage())).toEqual(DEFAULT_UI_COLORS);
    expect(loadUiColors(null)).toEqual(DEFAULT_UI_COLORS);
  });

  it("falls back to the defaults for a corrupt bag rather than failing to open the app", () => {
    expect(loadUiColors(storage("{not json"))).toEqual(DEFAULT_UI_COLORS);
  });

  it("fills in a colour a stored bag predates", () => {
    const store = storage(JSON.stringify({ effect: "#111111" }));
    const colors = loadUiColors(store);
    expect(colors.effect).toBe("#111111");
    expect(colors.waveform).toBe(DEFAULT_UI_COLORS.waveform);
  });
});

describe("rejecting anything that isn't a colour", () => {
  it("replaces a value that would paint nothing", () => {
    // These go straight into a canvas fillStyle. A bad value paints nothing rather than erroring,
    // which on a sequencer grid reads as effects that have vanished.
    expect(sanitizeColors({ ...DEFAULT_UI_COLORS, effect: "chartreuse" as never }).effect).toBe(DEFAULT_UI_COLORS.effect);
    expect(sanitizeColors({ ...DEFAULT_UI_COLORS, effect: "#12345" as never }).effect).toBe(DEFAULT_UI_COLORS.effect);
    expect(sanitizeColors({ ...DEFAULT_UI_COLORS, effect: 42 as never }).effect).toBe(DEFAULT_UI_COLORS.effect);
  });

  it("keeps a valid one, normalised to lower case", () => {
    expect(sanitizeColors({ ...DEFAULT_UI_COLORS, effect: "#AABBCC" }).effect).toBe("#aabbcc");
  });

  it("labels every colour, so the settings screen can't have a blank row", () => {
    for (const key of Object.keys(DEFAULT_UI_COLORS)) {
      expect(UI_COLOR_LABELS[key as keyof typeof DEFAULT_UI_COLORS], key).toBeTruthy();
    }
  });
});

describe("import, export and reset - the dialog's own buttons", () => {
  it("round-trips through export and import", () => {
    const colors = { ...DEFAULT_UI_COLORS, modelSelected: "#abcdef" };
    expect(importUiColors(exportUiColors(colors))).toEqual(colors);
  });

  it("refuses a file that isn't a colour set", () => {
    // Without this, any JSON file at all would "import" as the defaults and look like it worked.
    expect(importUiColors("not json")).toBeNull();
    expect(importUiColors("{}")).toBeNull();
    expect(importUiColors('{"unrelated":"#ffffff"}')).toBeNull();
    expect(importUiColors("null")).toBeNull();
  });

  it("accepts a partial set, filling the rest from the defaults", () => {
    const imported = importUiColors('{"effect":"#0f0f0f"}')!;
    expect(imported.effect).toBe("#0f0f0f");
    expect(imported.waveform).toBe(DEFAULT_UI_COLORS.waveform);
  });

  it("resets to the defaults", () => {
    expect(resetUiColors()).toEqual(DEFAULT_UI_COLORS);
  });
});

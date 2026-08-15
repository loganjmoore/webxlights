import { describe, expect, it } from "vitest";
import { boundWindowShortcuts, WINDOW_SHORTCUTS } from "../src/lib/windowShortcuts";

describe("the appendix's window keys", () => {
  it("has all thirteen the appendix lists", () => {
    expect(WINDOW_SHORTCUTS).toHaveLength(13);
    expect(WINDOW_SHORTCUTS.map((s) => s.keyLabel)).toEqual([
      "Ctrl+F1",
      "Ctrl+F2",
      "Ctrl+F3",
      "Ctrl+F4",
      "Ctrl+F5",
      "Ctrl+F6",
      "Ctrl+F7",
      "Ctrl+F8",
      "Ctrl+F9",
      "Ctrl+F10",
      "Ctrl+F11",
      "Ctrl+F12",
      "Ctrl+Alt+F8",
    ]);
  });

  // The point of keeping the unbound ones in the table: an absence with no reason beside it is
  // indistinguishable from a line someone forgot to finish.
  it("says why for every window it doesn't have", () => {
    for (const shortcut of WINDOW_SHORTCUTS) {
      if (shortcut.target === null) expect(shortcut.note, shortcut.keyLabel).toBeTruthy();
    }
  });

  it("doesn't explain away the ones it does have", () => {
    for (const shortcut of WINDOW_SHORTCUTS) {
      if (shortcut.target !== null) expect(shortcut.note, shortcut.keyLabel).toBeUndefined();
    }
  });

  // Two keys onto one panel would mean one of them appears to do nothing when pressed twice in a
  // row - it would be closing what the other just opened.
  it("gives each panel to exactly one key", () => {
    const targets = boundWindowShortcuts().map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("binds the five windows we have", () => {
    expect(boundWindowShortcuts().map((s) => s.keyLabel)).toEqual([
      "Ctrl+F6",
      "Ctrl+F7",
      "Ctrl+F10",
      "Ctrl+F11",
      "Ctrl+F12",
    ]);
  });

  // F8 appears twice - Effect Assist on its own and the Jukebox with Alt - so the modifier is
  // what tells them apart, and a matcher that ignored Alt would run the wrong one.
  it("distinguishes the two F8 entries by Alt", () => {
    const f8 = WINDOW_SHORTCUTS.filter((s) => s.key === "F8");
    expect(f8).toHaveLength(2);
    expect(f8.map((s) => s.alt)).toEqual([false, true]);
    expect(WINDOW_SHORTCUTS.filter((s) => s.alt)).toHaveLength(1);
  });
});

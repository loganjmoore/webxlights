import { describe, expect, it } from "vitest";
import { EFFECT_SHORTCUTS, buildCommands, commandForEvent, type CommandContext } from "../src/lib/commands";
import {
  RESERVED_KEYS,
  bindingKey,
  checkShortcut,
  effectShortcuts,
  loadShortcuts,
  saveShortcuts,
  setShortcut,
  shortcutRows,
} from "../src/lib/keybindings";

function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & { value: string | null } {
  return {
    value: null,
    getItem() {
      return this.value;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    },
  };
}

describe("effect shortcuts in force", () => {
  it("is xLights' own set until something is changed", () => {
    expect(effectShortcuts()).toEqual(EFFECT_SHORTCUTS);
  });

  it("keeps a shortcut's parameters when another one is rebound", () => {
    // The fade-up and fade-down keys are the On effect with its intensities swapped. Rebuilding
    // the list from key and effect alone would drop them and leave three keys placing a plain On.
    const rebound = effectShortcuts(setShortcut({}, "Fire", "z"));
    const fadeUp = rebound.find((s) => s.key === "u");
    expect(fadeUp?.params).toEqual({ startIntensity: 0, endIntensity: 100 });
  });

  it("rebinds one of the three On keys without moving the others", () => {
    // Stored against the shortcut rather than the effect name: three keys place On, and keying on
    // the name would move all three at once.
    const fadeUpId = bindingKey({ effect: "On", params: { startIntensity: 0, endIntensity: 100 } });
    const rebound = effectShortcuts(setShortcut({}, fadeUpId, "z"));
    expect(rebound.find((s) => s.params?.startIntensity === 0)?.key).toBe("z");
    expect(rebound.find((s) => s.effect === "On" && !s.params)?.key).toBe("o");
  });

  it("applies a change and marks it as one", () => {
    const overrides = setShortcut({}, "Fire", "z");
    expect(effectShortcuts(overrides).find((s) => s.effect === "Fire")!.key).toBe("z");
    expect(shortcutRows(overrides).find((r) => r.effect === "Fire")!.changed).toBe(true);
  });

  it("setting a shortcut back to xLights' own stops storing it", () => {
    // Otherwise "back to defaults" would leave rows that merely happen to match, and the
    // changed markers would lie.
    const original = EFFECT_SHORTCUTS.find((s) => s.effect === "Fire")!.key;
    const overrides = setShortcut(setShortcut({}, "Fire", "z"), "Fire", original);
    expect(overrides).toEqual({});
  });
});

describe("what a shortcut is allowed to be", () => {
  it("refuses a key that already places another effect, and says which", () => {
    // Two effects on one key means one silently stops working, and which one is an accident of
    // list order.
    const bars = EFFECT_SHORTCUTS.find((s) => s.effect === "Bars")!.key;
    const result = checkShortcut("Fire", bars, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Bars");
  });

  it("refuses the transport and timing keys", () => {
    for (const key of RESERVED_KEYS) {
      expect(checkShortcut("Fire", key, {}).ok, `${key} should be reserved`).toBe(false);
    }
  });

  it("refuses anything that isn't one character", () => {
    expect(checkShortcut("Fire", "", {}).ok).toBe(false);
    expect(checkShortcut("Fire", "ab", {}).ok).toBe(false);
  });

  it("allows a key freed up by another change", () => {
    // Fire's own key becomes available once Fire has been moved off it.
    const fire = EFFECT_SHORTCUTS.find((s) => s.effect === "Fire")!.key;
    const moved = setShortcut({}, "Fire", "z");
    expect(checkShortcut("Text", fire, moved).ok).toBe(true);
  });

  it("treats case as significant, as xLights does", () => {
    // `o` is On and `O` is Off there, so an upper-case letter is a distinct binding rather than
    // a variant of the lower-case one.
    expect(checkShortcut("Fire", "Z", { Text: "z" }).ok).toBe(true);
  });
});

describe("storing shortcuts", () => {
  it("round-trips", () => {
    const storage = fakeStorage();
    saveShortcuts(storage, { Fire: "z" });
    expect(loadShortcuts(storage)).toEqual({ Fire: "z" });
  });

  it("drops a stored binding for an effect that no longer has a shortcut", () => {
    // A binding nothing can dispatch is a key that quietly does nothing.
    const storage = fakeStorage();
    storage.value = JSON.stringify({ "Not An Effect": "z", Fire: "q" });
    expect(loadShortcuts(storage)).toEqual({ Fire: "q" });
  });

  it("drops a stored binding that isn't usable", () => {
    const storage = fakeStorage();
    storage.value = JSON.stringify({ Fire: "zz", Text: " " });
    expect(loadShortcuts(storage)).toEqual({});
  });

  it("survives storage that isn't there or isn't JSON", () => {
    expect(loadShortcuts(null)).toEqual({});
    const storage = fakeStorage();
    storage.value = "not json";
    expect(loadShortcuts(storage)).toEqual({});
  });
});

describe("the keyboard actually dispatches the changed binding", () => {
  it("places the effect on its new key and not on its old one", () => {
    const placed: string[] = [];
    const ctx = {
      togglePlay: () => {},
      seekStart: () => {},
      seekEnd: () => {},
      nudgePlayhead: () => {},
      addTimingMark: () => {},
      splitTimingMark: () => {},
      deleteSelected: () => {},
      copySelected: () => {},
      pasteAtPlayhead: () => {},
      duplicateSelected: () => {},
      undo: () => {},
      redo: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
      placeEffect: (name: string) => placed.push(name),
      openPalette: () => {},
      exportFseq: () => {},
      snapshot: () => {},
      effectShortcuts: effectShortcuts(setShortcut({}, "Fire", "z")),
    } satisfies CommandContext;

    const commands = buildCommands(ctx);
    commandForEvent(commands, { key: "z" })?.run();
    expect(placed).toEqual(["Fire"]);

    // The old key now places nothing, rather than still placing Fire as well.
    const oldKey = EFFECT_SHORTCUTS.find((s) => s.effect === "Fire")!.key;
    const onOldKey = commandForEvent(commands, { key: oldKey });
    expect(onOldKey?.id).not.toBe("effect.Fire");
  });
});

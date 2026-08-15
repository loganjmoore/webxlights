import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  formatTime,
  loadPreferences,
  sanitize,
  savePreferences,
  type Preferences,
} from "../src/lib/preferences";

function storage(initial?: string) {
  let value = initial;
  return {
    getItem: () => value ?? null,
    setItem: (_k: string, v: string) => {
      value = v;
    },
    read: () => value,
  };
}

describe("loading preferences", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(loadPreferences(storage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("fills in a preference the stored bag predates", () => {
    // Merged over the defaults rather than replacing them: a preference added later would
    // otherwise come back undefined for everyone with an existing bag, which is how a number
    // field ends up NaN and a duration ends up zero.
    const partial = storage(JSON.stringify({ timeFormat: "frames" }));
    const prefs = loadPreferences(partial);
    expect(prefs.timeFormat).toBe("frames");
    expect(prefs.defaultEffectMs).toBe(DEFAULT_PREFERENCES.defaultEffectMs);
  });

  it("falls back to the defaults for a corrupt bag rather than failing to open the app", () => {
    expect(loadPreferences(storage("{not json"))).toEqual(DEFAULT_PREFERENCES);
  });

  it("copes with no storage at all", () => {
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(null, DEFAULT_PREFERENCES)).not.toThrow();
  });

  it("round-trips through save and load", () => {
    const store = storage();
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, timeFormat: "seconds", defaultEffectMs: 2500 };
    savePreferences(store, prefs);
    expect(loadPreferences(store)).toEqual(prefs);
  });
});

describe("sanitising a hand-edited bag", () => {
  it("rejects a time format it doesn't know", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, timeFormat: "sundial" as never }).timeFormat).toBe(DEFAULT_PREFERENCES.timeFormat);
  });

  it("never allows a zero-length default effect", () => {
    // One placed at zero length can't be selected on the grid, so it would be unrecoverable.
    expect(sanitize({ ...DEFAULT_PREFERENCES, defaultEffectMs: 0 }).defaultEffectMs).toBeGreaterThan(0);
    expect(sanitize({ ...DEFAULT_PREFERENCES, defaultEffectMs: -500 }).defaultEffectMs).toBeGreaterThan(0);
  });

  it("keeps 0 for autosave, because that is what turns it off", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, autosaveSeconds: 0 }).autosaveSeconds).toBe(0);
  });

  it("floors a non-zero autosave at a second", () => {
    // A sub-second autosave would save on every keystroke of a rename.
    expect(sanitize({ ...DEFAULT_PREFERENCES, autosaveSeconds: 0.2 }).autosaveSeconds).toBe(1);
  });

  it("replaces a value that isn't a number at all", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, defaultEffectMs: "soon" as never }).defaultEffectMs).toBe(
      DEFAULT_PREFERENCES.defaultEffectMs,
    );
  });

  it("keeps the booleans boolean", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, snapToTiming: false }).snapToTiming).toBe(false);
    expect(sanitize({ ...DEFAULT_PREFERENCES, snapToTiming: undefined as never }).snapToTiming).toBe(true);
  });

  it("offers no preference that nothing reads", () => {
    // A settings screen full of switches with nothing behind them is worse than a short one:
    // every control here has to change something observable.
    expect(Object.keys(DEFAULT_PREFERENCES).sort()).toEqual(
      ["autosaveSeconds", "defaultEffectMs", "layoutSnapshotMinutes", "snapToTiming", "timeFormat"],
    );
  });
});

describe("writing a moment", () => {
  it("writes minutes and seconds", () => {
    expect(formatTime(0, "mmss")).toBe("0:00.00");
    expect(formatTime(65_430, "mmss")).toBe("1:05.43");
    expect(formatTime(3_600_000, "mmss")).toBe("60:00.00");
  });

  it("writes plain seconds", () => {
    expect(formatTime(1500, "seconds")).toBe("1.50s");
  });

  it("writes a frame number against the sequence's own frame rate", () => {
    // A 20ms sequence and a 50ms one number the same second very differently, so a frame count
    // that assumed one of them would be wrong for half of all shows.
    expect(formatTime(1000, "frames", 50)).toBe("20");
    expect(formatTime(1000, "frames", 20)).toBe("50");
  });

  it("never produces a negative or NaN time", () => {
    expect(formatTime(-100, "mmss")).toBe("0:00.00");
    expect(formatTime(Number.NaN, "seconds")).toBe("0.00s");
    expect(formatTime(1000, "frames", 0)).toBe("1000"); // a zero frame rate can't divide
  });
});

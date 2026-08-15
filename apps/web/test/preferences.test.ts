import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  GRID_ROW_HEIGHT_PX,
  GRID_SPACING_LABELS,
  WAVEFORM_HEIGHT_PX,
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
    expect(Object.keys(DEFAULT_PREFERENCES).sort()).toEqual([
      "autosaveSeconds",
      "defaultEffectMs",
      "doubleClickMode",
      "gridSpacing",
      "layoutSnapshotMinutes",
      "showTransitionMarks",
      "smallWaveform",
      "snapToTiming",
      "snapshotOnSave",
      "timeFormat",
      "timelineZoomAnchor",
      "versionRetentionDays",
    ]);
  });
});

describe("the effects grid settings", () => {
  it("resolves every spacing to a height, smallest to largest", () => {
    // A named size with no height behind it would be a control that changes nothing, and two
    // sizes resolving to the same height would be two controls that do the same thing.
    const heights = (["xs", "s", "m", "l", "xl"] as const).map((key) => GRID_ROW_HEIGHT_PX[key]);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(heights.length);
    // The smallest still has to fit the 11px row label the grid draws.
    expect(Math.min(...heights)).toBeGreaterThan(11);
  });

  it("names every spacing, in xLights' own words", () => {
    expect(Object.keys(GRID_SPACING_LABELS).sort()).toEqual(Object.keys(GRID_ROW_HEIGHT_PX).sort());
    expect(GRID_SPACING_LABELS.xs).toBe("Extra Small");
  });

  it("makes the small waveform smaller", () => {
    expect(WAVEFORM_HEIGHT_PX.small).toBeLessThan(WAVEFORM_HEIGHT_PX.full);
  });

  it("rejects a spacing it doesn't know", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, gridSpacing: "huge" as never }).gridSpacing).toBe(DEFAULT_PREFERENCES.gridSpacing);
  });

  it("keeps transition marks on unless they were turned off", () => {
    // This one defaults on, so an unset value has to become true rather than false - which is the
    // opposite of every other boolean here and the reason it gets its own check.
    expect(sanitize({ ...DEFAULT_PREFERENCES, showTransitionMarks: undefined as never }).showTransitionMarks).toBe(true);
    expect(sanitize({ ...DEFAULT_PREFERENCES, showTransitionMarks: false }).showTransitionMarks).toBe(false);
  });

  it("zooms around the cursor unless told to use the play marker", () => {
    // "Zoom in on the Sequencer Timeline based on the Play Marker or the Mouse Cursor Location."
    // The cursor is the default: a zoom made with the mouse is aimed at something.
    expect(DEFAULT_PREFERENCES.timelineZoomAnchor).toBe("cursor");
    expect(sanitize({ ...DEFAULT_PREFERENCES, timelineZoomAnchor: "playhead" }).timelineZoomAnchor).toBe("playhead");
    expect(sanitize({ ...DEFAULT_PREFERENCES, timelineZoomAnchor: "elsewhere" as never }).timelineZoomAnchor).toBe("cursor");
  });

  it("keeps snapshots forever unless told otherwise, and only for a window it offers", () => {
    // Deleting someone's history is not a thing to start doing because a setting was added, and
    // the whole value of a backup is that it is there when it finally matters.
    expect(DEFAULT_PREFERENCES.versionRetentionDays).toBe(0);
    expect(sanitize({ ...DEFAULT_PREFERENCES, versionRetentionDays: 31 }).versionRetentionDays).toBe(31);
    // A hand-edited 1 would delete yesterday's work every time a snapshot was taken.
    expect(sanitize({ ...DEFAULT_PREFERENCES, versionRetentionDays: 1 }).versionRetentionDays).toBe(0);
    expect(sanitize({ ...DEFAULT_PREFERENCES, versionRetentionDays: -5 }).versionRetentionDays).toBe(0);
  });

  it("only knows two double-click modes", () => {
    expect(sanitize({ ...DEFAULT_PREFERENCES, doubleClickMode: "edit-text" }).doubleClickMode).toBe("edit-text");
    expect(sanitize({ ...DEFAULT_PREFERENCES, doubleClickMode: "open-dialog" as never }).doubleClickMode).toBe("play-timing");
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

describe("every preference can be changed as well as read", () => {
  it("clamps the layout snapshot interval and lets it be turned off", () => {
    // 0 is meaningful - it turns the periodic snapshot off - and anything above it is floored at
    // a minute, since a snapshot copies the whole layout.
    expect(sanitize({ ...DEFAULT_PREFERENCES, layoutSnapshotMinutes: 0 }).layoutSnapshotMinutes).toBe(0);
    expect(sanitize({ ...DEFAULT_PREFERENCES, layoutSnapshotMinutes: -5 }).layoutSnapshotMinutes).toBe(1);
    expect(sanitize({ ...DEFAULT_PREFERENCES, layoutSnapshotMinutes: 9999 }).layoutSnapshotMinutes).toBe(120);
  });
});

describe("backup on save", () => {
  it("is off by default, and stays a boolean", () => {
    // Off deliberately: a save in xLights is a deliberate act, where every model drag here saves
    // immediately - on by default would snapshot every few seconds during an afternoon of
    // arranging props.
    expect(DEFAULT_PREFERENCES.snapshotOnSave).toBe(false);
    expect(sanitize({ ...DEFAULT_PREFERENCES, snapshotOnSave: true }).snapshotOnSave).toBe(true);
    expect(sanitize({ ...DEFAULT_PREFERENCES, snapshotOnSave: "yes" as never }).snapshotOnSave).toBe(false);
  });
});

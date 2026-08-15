// xLights' Preferences (manual: File > Settings). Application-level choices, not show data.
//
// Kept in localStorage rather than on the server, deliberately: a preference belongs to the person
// at the keyboard, not to the show. Two people editing the same project should not be able to
// change each other's time display or default effect length, and a preference that travelled with
// the project would do exactly that.
//
// Every preference here is one that something actually reads. xLights' full Settings dialog has
// eight tabs, most of which configure machinery this app doesn't have (output devices, backup
// paths, services); offering those would be controls with nothing behind them.

export type TimeFormat = "seconds" | "mmss" | "frames";

/** xLights' Effects Grid > Spacing: "Extra Small, Small, Medium, Large, Extra Large". */
export type GridSpacing = "xs" | "s" | "m" | "l" | "xl";

/** What a double-click on a timing mark does (xLights' Effects Grid > Double Click Mode). */
export type DoubleClickMode = "play-timing" | "edit-text";

/**
 * Grid row height for each spacing. xLights names the sizes rather than giving pixel counts, so
 * these are ours - chosen so the smallest still fits an 11px effect label and the largest is
 * roughly double it, which is the range the setting is for: fitting fifty rows on a laptop, or
 * hitting the right one with a trackpad.
 */
export const GRID_ROW_HEIGHT_PX: Record<GridSpacing, number> = { xs: 18, s: 23, m: 28, l: 36, xl: 46 };

export const GRID_SPACING_LABELS: Record<GridSpacing, string> = {
  xs: "Extra Small",
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "Extra Large",
};

/** Waveform height, full and small (xLights' Effects Grid > Small Waveform). */
export const WAVEFORM_HEIGHT_PX = { full: 64, small: 32 } as const;

export interface Preferences {
  /** How the timeline and playhead write a moment. */
  timeFormat: TimeFormat;
  /** Length of an effect dropped without dragging one out, in milliseconds. */
  defaultEffectMs: number;
  /** Snap effect edges to timing marks while dragging. */
  snapToTiming: boolean;
  /** Seconds between autosaves. 0 turns autosave off. */
  autosaveSeconds: number;
  /**
   * Minutes between automatic layout snapshots. 0 turns them off.
   *
   * xLights offers 3, 10, 15 or 30 for the same thing ("Every x (3,10,15,30) minutes... the
   * xlights_rgbeffects.xml is backed up... This includes the layout as well").
   */
  layoutSnapshotMinutes: number;
  /**
   * Snapshot the layout after an edit as well as on the timer.
   *
   * xLights' "Backup on Save". Off by default, and that default is the whole design question: a
   * save there is a deliberate act, where every model drag here saves immediately. On by default
   * would mean a snapshot every few seconds during an afternoon of arranging props.
   */
  snapshotOnSave: boolean;
  /** Height of a grid row, named rather than measured (xLights' Effects Grid > Spacing). */
  gridSpacing: GridSpacing;
  /**
   * Draw the waveform at half height.
   *
   * Worth having for the same reason the spacing setting is: the waveform and the grid share the
   * vertical space, and on a laptop the choice between seeing the beats and seeing the rows is a
   * real one.
   */
  smallWaveform: boolean;
  /**
   * Show where an effect's in and out transitions run.
   *
   * On by default: an effect with a two-second reveal looks exactly like one without, which makes
   * "why is this fading in" a question you can only answer by clicking it.
   */
  showTransitionMarks: boolean;
  /** Whether double-clicking a timing mark plays its interval or edits its label. */
  doubleClickMode: DoubleClickMode;
}

export const DEFAULT_PREFERENCES: Preferences = {
  timeFormat: "mmss",
  defaultEffectMs: 1000,
  snapToTiming: true,
  autosaveSeconds: 5,
  layoutSnapshotMinutes: 15,
  snapshotOnSave: false,
  gridSpacing: "m",
  smallWaveform: false,
  showTransitionMarks: true,
  doubleClickMode: "play-timing",
};

const STORAGE_KEY = "webxlights.preferences";

/**
 * Reads stored preferences, filling in anything missing.
 *
 * Merged over the defaults rather than replacing them, so a preference added later doesn't come
 * back undefined for everyone who already has a stored bag - which is how a number field ends up
 * NaN and a duration ends up zero.
 */
export function loadPreferences(storage: Pick<Storage, "getItem"> | null | undefined): Preferences {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return sanitize({ ...DEFAULT_PREFERENCES, ...parsed });
  } catch {
    // A corrupt bag is a preference problem, not a reason to fail to open the app.
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(storage: Pick<Storage, "setItem"> | null | undefined, prefs: Preferences): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitize(prefs)));
  } catch {
    // Private browsing, a full quota - neither is worth interrupting an edit over.
  }
}

/** Clamps every value into a range that means something, so a hand-edited bag can't break a page. */
export function sanitize(prefs: Preferences): Preferences {
  const formats: TimeFormat[] = ["seconds", "mmss", "frames"];
  return {
    timeFormat: formats.includes(prefs.timeFormat) ? prefs.timeFormat : DEFAULT_PREFERENCES.timeFormat,
    // A zero-length effect can't be selected on the grid, so it would be unrecoverable once made.
    defaultEffectMs: clamp(prefs.defaultEffectMs, 50, 60_000, DEFAULT_PREFERENCES.defaultEffectMs),
    snapToTiming: prefs.snapToTiming !== false,
    // 0 is meaningful here: it turns autosave off. Anything above 0 is floored at a second, since
    // a sub-second autosave would save on every keystroke of a rename.
    autosaveSeconds: prefs.autosaveSeconds === 0 ? 0 : clamp(prefs.autosaveSeconds, 1, 600, DEFAULT_PREFERENCES.autosaveSeconds),
    // 0 is meaningful here too: it turns the periodic snapshot off. A snapshot copies the whole
    // layout, so the floor is a minute rather than a second.
    layoutSnapshotMinutes:
      prefs.layoutSnapshotMinutes === 0 ? 0 : clamp(prefs.layoutSnapshotMinutes, 1, 120, DEFAULT_PREFERENCES.layoutSnapshotMinutes),
    snapshotOnSave: prefs.snapshotOnSave === true,
    gridSpacing: prefs.gridSpacing in GRID_ROW_HEIGHT_PX ? prefs.gridSpacing : DEFAULT_PREFERENCES.gridSpacing,
    smallWaveform: prefs.smallWaveform === true,
    // Defaults on, so an unset value has to become true rather than false.
    showTransitionMarks: prefs.showTransitionMarks !== false,
    doubleClickMode: prefs.doubleClickMode === "edit-text" ? "edit-text" : "play-timing",
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Writes a moment the way the preference asks for.
 *
 * "frames" needs the sequence's frame rate, which is why it is a parameter rather than a constant -
 * a 20ms sequence and a 50ms one number the same second very differently, and a frame count that
 * silently assumed one of them would be wrong for half of all shows.
 */
export function formatTime(ms: number, format: TimeFormat, frameMs = 50): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (format === "frames") return String(Math.round(safe / Math.max(1, frameMs)));
  if (format === "seconds") return `${(safe / 1000).toFixed(2)}s`;

  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((safe % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

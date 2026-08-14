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

export interface Preferences {
  /** How the timeline and playhead write a moment. */
  timeFormat: TimeFormat;
  /** Length of an effect dropped without dragging one out, in milliseconds. */
  defaultEffectMs: number;
  /** Snap effect edges to timing marks while dragging. */
  snapToTiming: boolean;
  /** Seconds between autosaves. 0 turns autosave off. */
  autosaveSeconds: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  timeFormat: "mmss",
  defaultEffectMs: 1000,
  snapToTiming: true,
  autosaveSeconds: 5,
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

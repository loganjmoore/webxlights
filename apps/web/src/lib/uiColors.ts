// xLights' File > Settings > Colors (manual: Menus > File > Settings > Colors). "The Color Tab
// allows the user to change the colors options of xLights. The first two columns relate to the
// colors in the Sequence Tab, while the third column changes Layout Colors."
//
// This is app chrome, not show data: the colour of a timing-track header, an effect's bounding
// box, the waveform, a selected model. It matters more than a theme usually does because a
// sequencer grid is dense - people who work in one for hours have real preferences about which
// things stand out, and someone colour-blind may need the selected/unselected pair to differ by
// more than hue.
//
// Kept per-browser with the other preferences, and for the same reason: how the app looks belongs
// to the person looking at it, not to the show.

export interface UiColors {
  // Sequencer
  timingTrackHeader: string;
  timingMark: string;
  effect: string;
  effectSelected: string;
  rowHeading: string;
  rowHeadingText: string;
  rowHeadingSelected: string;
  gridlines: string;
  waveform: string;
  waveformBackground: string;
  // Layout
  modelDefault: string;
  modelSelected: string;
  /** Two models sharing channels - the one colour on the Layout page that reports a fault. */
  modelOverlap: string;
}

export const DEFAULT_UI_COLORS: UiColors = {
  timingTrackHeader: "#2c3038",
  timingMark: "#8a8f98",
  effect: "#50a0ff",
  effectSelected: "#ffc878",
  rowHeading: "#1e1e26",
  rowHeadingText: "#dddddd",
  rowHeadingSelected: "#2c2c38",
  gridlines: "#33333d",
  waveform: "#6a9fd8",
  waveformBackground: "#14141a",
  modelDefault: "#50a0ff",
  modelSelected: "#ffc878",
  modelOverlap: "#b3261e",
};

/** The label each colour shows under, in the manual's own words where it has them. */
export const UI_COLOR_LABELS: Record<keyof UiColors, string> = {
  timingTrackHeader: "Timing track header",
  timingMark: "Timing marks",
  effect: "Effect",
  effectSelected: "Effect selected",
  rowHeading: "Row heading",
  rowHeadingText: "Row heading text",
  rowHeadingSelected: "Row heading selected",
  gridlines: "Gridlines",
  waveform: "Waveform",
  waveformBackground: "Waveform background",
  modelDefault: "Model (layout)",
  modelSelected: "Model selected",
  modelOverlap: "Model channel overlap",
};

const STORAGE_KEY = "webxlights.uiColors";
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Reads stored colours, filling in anything missing and rejecting anything that isn't a colour.
 *
 * These values go straight into a canvas `fillStyle` and into inline styles. A stored value that
 * isn't a colour would silently paint nothing rather than erroring, which on a sequencer grid
 * reads as effects that have vanished.
 */
export function loadUiColors(storage: Pick<Storage, "getItem"> | null | undefined): UiColors {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_COLORS };
    const parsed = JSON.parse(raw) as Partial<UiColors>;
    return sanitizeColors({ ...DEFAULT_UI_COLORS, ...parsed });
  } catch {
    return { ...DEFAULT_UI_COLORS };
  }
}

export function saveUiColors(storage: Pick<Storage, "setItem"> | null | undefined, colors: UiColors): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeColors(colors)));
  } catch {
    // Private browsing, a full quota - neither is worth interrupting an edit over.
  }
}

export function sanitizeColors(colors: UiColors): UiColors {
  const out = { ...DEFAULT_UI_COLORS };
  for (const key of Object.keys(DEFAULT_UI_COLORS) as Array<keyof UiColors>) {
    const value = colors[key];
    if (typeof value === "string" && HEX.test(value)) out[key] = value.toLowerCase();
  }
  return out;
}

/** "Reset Defaults", which the manual's own dialog offers. */
export function resetUiColors(): UiColors {
  return { ...DEFAULT_UI_COLORS };
}

/** "Export" - the dialog offers taking a colour set to another machine. */
export function exportUiColors(colors: UiColors): string {
  return JSON.stringify(sanitizeColors(colors), null, 2);
}

/**
 * "Import". Returns null rather than throwing for anything that isn't a colour set - this is
 * driven by a file picker, and a throw there reaches the app's error overlay.
 */
export function importUiColors(text: string): UiColors | null {
  try {
    const parsed = JSON.parse(text) as Partial<UiColors>;
    if (!parsed || typeof parsed !== "object") return null;
    // At least one real colour, or a JSON file of anything at all would "import" as the defaults
    // and look like it worked.
    const hasOne = (Object.keys(DEFAULT_UI_COLORS) as Array<keyof UiColors>).some(
      (k) => typeof parsed[k] === "string" && HEX.test(parsed[k] as string),
    );
    return hasOne ? sanitizeColors({ ...DEFAULT_UI_COLORS, ...parsed }) : null;
  } catch {
    return null;
  }
}

// The appendix's window keys (manual: appendicies/keyboard-shortcuts, "Sequence Toolbar Windows").
//
// Thirteen keys, each toggling one of xLights' dockable windows: CTRL+F1 to CTRL+F12, plus
// CTRL+ALT+F8 for the Jukebox. We have five of those windows and not the other eight.
//
// The whole set is in this table, including the eight we can't bind, because an absence that is
// data can be checked and an absence that is a missing line can't. A test asserts every entry
// without a panel says why, so "we don't have that window" stays a stated answer rather than
// something that quietly reads as an oversight - and when one of those windows does get built,
// the key is already written down next to it.

/**
 * What a window key toggles here.
 *
 * Deliberately not `PanelId` from perspectives.ts: that list is the panels a *perspective* can
 * remember, which is a different question from which windows the appendix names. They overlap
 * without being the same set - the Select Effects panel is here and not there.
 */
export type WindowTarget = "models" | "presets" | "select" | "prefs" | "housePreview";

export interface WindowShortcut {
  /** The key as the appendix writes it. */
  keyLabel: string;
  /** The `key` of the KeyboardEvent: "F7" and so on. */
  key: string;
  /** CTRL+ALT+F8 is the one entry in the set with a second modifier. */
  alt: boolean;
  /** The manual's own name for the window, quoted. */
  window: string;
  /** What it toggles here, or null when there is no such window to toggle. */
  target: WindowTarget | null;
  /** Why there isn't one. Every entry without a target has one of these. */
  note?: string;
}

export const WINDOW_SHORTCUTS: readonly WindowShortcut[] = [
  {
    keyLabel: "Ctrl+F1",
    key: "F1",
    alt: false,
    window: "Toggle Effect Window On/Off",
    target: null,
    note: "An effect's settings are a panel beside the grid here, not a window that closes",
  },
  {
    keyLabel: "Ctrl+F2",
    key: "F2",
    alt: false,
    window: "Toggle Color Selector Window On/Off",
    target: null,
    note: "The palette is part of the effect's settings panel rather than a window of its own",
  },
  {
    keyLabel: "Ctrl+F3",
    key: "F3",
    alt: false,
    window: "Toggle Layer Settings Window On/Off",
    target: null,
    note: "Layers are added and removed from the row's own menu; there is no layer settings window",
  },
  {
    keyLabel: "Ctrl+F4",
    key: "F4",
    alt: false,
    window: "Togle Layer Blending Window On/Off",
    target: null,
    note: "Blend mode and Mix are in the effect's settings panel, next to what they affect",
  },
  {
    keyLabel: "Ctrl+F5",
    key: "F5",
    alt: false,
    window: "Toggle Model Preview Window On/Off",
    target: null,
    note: "We preview the house, not one model - a single-model preview doesn't exist yet",
  },
  {
    keyLabel: "Ctrl+F6",
    key: "F6",
    alt: false,
    window: "Toggle House Preview Window On/Off",
    // The docked preview is always there, so what this toggles is the second copy in its own
    // window - which is the one that behaves like xLights' dockable panel, and the one worth a
    // key: it's how the preview gets onto a second monitor.
    target: "housePreview",
  },
  {
    keyLabel: "Ctrl+F7",
    key: "F7",
    alt: false,
    window: "Toggle Display Elements Window On/Off",
    // xLights' Display Elements is where the rows the sequencer shows are chosen, which is what
    // the Models panel does here.
    target: "models",
  },
  {
    keyLabel: "Ctrl+F8",
    key: "F8",
    alt: false,
    window: "Toggle Effect Assist Window On/Off",
    target: null,
    note: "No Effect Assist panel: the Pixel and Sketch editors are it for two effects, not in general",
  },
  {
    keyLabel: "Ctrl+F9",
    key: "F9",
    alt: false,
    window: "Toggle Effects Window On/Off",
    target: null,
    note: "The effect palette is a fixed strip above the grid, and closing it would leave nothing to drag from",
  },
  { keyLabel: "Ctrl+F10", key: "F10", alt: false, window: "Show Effect Presets Window", target: "presets" },
  { keyLabel: "Ctrl+F11", key: "F11", alt: false, window: "Select Effects Toggle", target: "select" },
  {
    keyLabel: "Ctrl+F12",
    key: "F12",
    alt: false,
    window: "Perspectives toggle",
    // The perspectives list lives inside the Preferences panel here - both are arrangements that
    // belong to the person at the keyboard rather than to the show - so this opens that.
    target: "prefs",
  },
  {
    keyLabel: "Ctrl+Alt+F8",
    key: "F8",
    alt: true,
    window: "Jukebox toggle",
    target: null,
    note: "No Jukebox: it's a pad of saved effects to trigger live, and nothing here plays live yet",
  },
];

/** One that has somewhere to go, which is the only kind that can become a command. */
export interface BoundWindowShortcut extends WindowShortcut {
  target: WindowTarget;
}

/** The ones that toggle something, which are the ones that become commands. */
export function boundWindowShortcuts(): BoundWindowShortcut[] {
  return WINDOW_SHORTCUTS.filter((s): s is BoundWindowShortcut => s.target !== null);
}

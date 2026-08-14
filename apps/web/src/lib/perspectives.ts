// xLights' View > Perspectives (manual: Menus > View > Perspectives). A perspective is a saved
// arrangement of which panels are showing - "sequencing" with the props panel and the grid, or
// "checking" with the preview and the models list.
//
// It matters more here than it sounds, because this page has a lot of panels now: Views,
// Presets, Regions, Preferences, Models, Timing, FPP. Getting back to a working arrangement after
// opening three of them is otherwise a matter of remembering which ones you had.
//
// Stored per-browser like preferences, and for the same reason: an arrangement of panels belongs
// to the person looking at them, not to the show.

export interface Perspective {
  name: string;
  panels: string[];
}

const STORAGE_KEY = "webxlights.perspectives";

/** The panels a perspective can remember. Anything not in this list is simply not saved. */
export const PANEL_IDS = ["models", "timing", "views", "presets", "regions", "prefs", "fpp", "preview"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export function loadPerspectives(storage: Pick<Storage, "getItem"> | null | undefined): Perspective[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPerspective).map((p) => ({ name: p.name, panels: p.panels.filter(isPanelId) }));
  } catch {
    // A corrupt bag is a layout problem, not a reason to fail to open the page.
    return [];
  }
}

export function savePerspectives(storage: Pick<Storage, "setItem"> | null | undefined, list: Perspective[]): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private browsing, a full quota - neither is worth interrupting an edit over.
  }
}

function isPerspective(value: unknown): value is Perspective {
  const p = value as Perspective;
  return !!p && typeof p.name === "string" && p.name.length > 0 && Array.isArray(p.panels);
}

function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && (PANEL_IDS as readonly string[]).includes(value);
}

/**
 * Adds or replaces a perspective by name.
 *
 * Saving over an existing name replaces it rather than making a second entry - two perspectives
 * called "Sequencing" would be indistinguishable in the picker, and picking the wrong one is the
 * failure the picker exists to avoid.
 */
export function upsertPerspective(list: Perspective[], perspective: Perspective): Perspective[] {
  const without = list.filter((p) => p.name !== perspective.name);
  return [...without, perspective].sort((a, b) => a.name.localeCompare(b.name));
}

export function removePerspective(list: Perspective[], name: string): Perspective[] {
  return list.filter((p) => p.name !== name);
}

/** Which panels are open, as a perspective's panel list. */
export function panelsFrom(open: Record<PanelId, boolean>): PanelId[] {
  return PANEL_IDS.filter((id) => open[id]);
}

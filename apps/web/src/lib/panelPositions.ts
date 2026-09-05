// Where a panel was left, so it opens there next time.
//
// A panel you dragged to the corner and pinned is a panel you have arranged; reopening it in the
// middle of the screen throws that arrangement away. Stored per panel, per browser, like the
// perspectives it complements (perspectives.ts remembers *which* panels are open; this
// remembers *where*).

export interface PanelPlacement {
  x: number;
  y: number;
  /** Pinned: open without a backdrop, so the grid underneath stays usable. */
  pinned: boolean;
}

const STORAGE_KEY = "webxlights.panelPositions";

type Store = Pick<Storage, "getItem" | "setItem"> | null | undefined;

function readAll(storage: Store): Record<string, PanelPlacement> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, PanelPlacement> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<PanelPlacement> | null;
      if (v && typeof v.x === "number" && typeof v.y === "number" && Number.isFinite(v.x) && Number.isFinite(v.y)) {
        out[id] = { x: v.x, y: v.y, pinned: v.pinned === true };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function loadPlacement(storage: Store, id: string): PanelPlacement | null {
  return readAll(storage)[id] ?? null;
}

export function savePlacement(storage: Store, id: string, placement: PanelPlacement | null): void {
  try {
    const all = readAll(storage);
    if (placement) all[id] = placement;
    else delete all[id];
    storage?.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Private browsing or a full quota: losing a remembered position is not worth an error.
  }
}

/**
 * Keeps a panel reachable: its title bar must stay inside the window, or there is nothing left
 * to grab to bring it back. A remembered position from a bigger monitor is the usual way this
 * goes wrong.
 */
export function clampToViewport(
  placement: { x: number; y: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewport.width - panel.width - margin);
  const maxY = Math.max(margin, viewport.height - Math.min(panel.height, 40) - margin);
  return {
    x: Math.round(Math.min(Math.max(placement.x, margin), maxX)),
    y: Math.round(Math.min(Math.max(placement.y, margin), maxY)),
  };
}

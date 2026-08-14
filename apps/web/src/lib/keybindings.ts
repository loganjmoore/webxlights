import { EFFECT_SHORTCUTS } from "./commands";

// User-editable effect shortcuts (manual: Sequencer > Shortcuts).
//
// "These effects are stored in the xlights_keybindings.xml file and can be modified by the user."
// The registry here has always had xLights' own defaults; what was missing is that they are
// *defaults* rather than rules. Someone who reaches for a different letter for Fire has no way to
// say so, and single-letter shortcuts are exactly the kind of thing muscle memory owns.
//
// Kept per-browser with the other preferences: which key drops which effect belongs to the person
// at the keyboard, not to the show. (xLights keeps them in the show folder, which is the same
// reasoning applied to a program with one user per machine.)

/** effect name -> the single character that places it. Only what differs from the defaults. */
export type ShortcutOverrides = Record<string, string>;

const STORAGE_KEY = "webxlights.keybindings";

/**
 * Keys that already mean something else and can't be reassigned.
 *
 * A shortcut that shadows the transport or the timing keys wouldn't fail - it would place an
 * effect when someone meant to add a timing mark, which is worse than being refused.
 */
export const RESERVED_KEYS = new Set([" ", "t", "s", "T", "S"]);

export interface ShortcutRow {
  effect: string;
  key: string;
  /** Whether this row differs from the shortcut xLights ships. */
  changed: boolean;
}

/** The shortcuts in force: xLights' defaults with any of this browser's changes applied. */
export function effectShortcuts(overrides: ShortcutOverrides = {}): Array<{ key: string; effect: string }> {
  return EFFECT_SHORTCUTS.map(({ key, effect }) => ({ effect, key: overrides[effect] ?? key }));
}

export function shortcutRows(overrides: ShortcutOverrides = {}): ShortcutRow[] {
  return EFFECT_SHORTCUTS.map(({ key, effect }) => ({
    effect,
    key: overrides[effect] ?? key,
    changed: overrides[effect] !== undefined && overrides[effect] !== key,
  }));
}

export interface ShortcutProblem {
  ok: false;
  reason: string;
}

/**
 * Whether a key can be given to an effect.
 *
 * Rejects rather than warns, and says which effect it would have clashed with: two effects on one
 * key means one of them silently stops working, and the one that stops is whichever the registry
 * happens to list second.
 */
export function checkShortcut(effect: string, key: string, overrides: ShortcutOverrides): { ok: true } | ShortcutProblem {
  if (key.length !== 1) return { ok: false, reason: "A shortcut is a single character." };
  if (RESERVED_KEYS.has(key)) return { ok: false, reason: `${key === " " ? "Space" : key} is already the transport or timing key.` };
  const clash = effectShortcuts(overrides).find((s) => s.key === key && s.effect !== effect);
  if (clash) return { ok: false, reason: `${key} already places ${clash.effect}.` };
  return { ok: true };
}

/** Sets one shortcut, or clears it back to xLights' own by passing the default key. */
export function setShortcut(overrides: ShortcutOverrides, effect: string, key: string): ShortcutOverrides {
  const next = { ...overrides };
  const original = EFFECT_SHORTCUTS.find((s) => s.effect === effect)?.key;
  if (key === original) delete next[effect];
  else next[effect] = key;
  return next;
}

export function loadShortcuts(storage: Pick<Storage, "getItem"> | null | undefined): ShortcutOverrides {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const known = new Set(EFFECT_SHORTCUTS.map((s) => s.effect));
    const out: ShortcutOverrides = {};
    for (const [effect, key] of Object.entries(parsed as Record<string, unknown>)) {
      // An effect that no longer has a shortcut, or a key that isn't one character, is dropped
      // rather than kept: a stored binding nothing can dispatch is a key that quietly does nothing.
      if (known.has(effect) && typeof key === "string" && key.length === 1 && !RESERVED_KEYS.has(key)) out[effect] = key;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveShortcuts(storage: Pick<Storage, "setItem"> | null | undefined, overrides: ShortcutOverrides): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private browsing, a full quota - neither is worth interrupting an edit over.
  }
}

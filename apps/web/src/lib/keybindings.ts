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
// Capital S is no longer reserved: the appendix distinguishes `s` (split timing mark) from
// `S` (Spirals), and case has always been significant here, so reserving both was reserving
// one key too many.
export const RESERVED_KEYS = new Set([" ", "t", "s", "T", "2", "3", "4"]);

export interface ShortcutRow {
  /** What the row is stored against - not the label, since two rows can place the same effect. */
  id: string;
  effect: string;
  key: string;
  /** Whether this row differs from the shortcut xLights ships. */
  changed: boolean;
}

/** The shortcuts in force: xLights' defaults with any of this browser's changes applied. */
export function effectShortcuts(overrides: ShortcutOverrides = {}): typeof EFFECT_SHORTCUTS {
  // Spread rather than rebuild: a shortcut can carry parameters (the fade-up and fade-down keys
  // are the On effect with its intensities swapped), and rebuilding from key and effect alone
  // would drop them - leaving two keys that both place a plain On.
  return EFFECT_SHORTCUTS.map((shortcut) => ({ ...shortcut, key: overrides[bindingKey(shortcut)] ?? shortcut.key }));
}

/**
 * What a binding is stored against.
 *
 * The effect name alone isn't enough now that three keys place On: rebinding "fade up" would
 * otherwise move all three.
 */
export function bindingKey(shortcut: { effect: string; params?: unknown }): string {
  return shortcut.params ? `${shortcut.effect}:${JSON.stringify(shortcut.params)}` : shortcut.effect;
}

export function shortcutRows(overrides: ShortcutOverrides = {}): ShortcutRow[] {
  return EFFECT_SHORTCUTS.map((shortcut) => {
    const id = bindingKey(shortcut);
    return {
      effect: shortcut.params ? `${shortcut.effect} (${shortcut.key === "u" ? "fade up" : "fade down"})` : shortcut.effect,
      id,
      key: overrides[id] ?? shortcut.key,
      changed: overrides[id] !== undefined && overrides[id] !== shortcut.key,
    };
  });
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
export function checkShortcut(id: string, key: string, overrides: ShortcutOverrides): { ok: true } | ShortcutProblem {
  if (key.length !== 1) return { ok: false, reason: "A shortcut is a single character." };
  if (RESERVED_KEYS.has(key)) return { ok: false, reason: `${key === " " ? "Space" : key} is already a transport or timing key.` };
  const clash = effectShortcuts(overrides).find((s) => s.key === key && bindingKey(s) !== id);
  if (clash) return { ok: false, reason: `${key} already places ${clash.effect}.` };
  return { ok: true };
}

/** Sets one shortcut, or clears it back to xLights' own by passing the default key. */
export function setShortcut(overrides: ShortcutOverrides, id: string, key: string): ShortcutOverrides {
  const next = { ...overrides };
  const original = EFFECT_SHORTCUTS.find((s) => bindingKey(s) === id)?.key;
  if (key === original) delete next[id];
  else next[id] = key;
  return next;
}

export function loadShortcuts(storage: Pick<Storage, "getItem"> | null | undefined): ShortcutOverrides {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const known = new Set(EFFECT_SHORTCUTS.map(bindingKey));
    const out: ShortcutOverrides = {};
    for (const [id, key] of Object.entries(parsed as Record<string, unknown>)) {
      // A binding that no longer matches a shortcut, or a key that isn't one character, is dropped
      // rather than kept: a stored binding nothing can dispatch is a key that quietly does nothing.
      if (known.has(id) && typeof key === "string" && key.length === 1 && !RESERVED_KEYS.has(key)) out[id] = key;
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

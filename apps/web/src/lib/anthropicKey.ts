// The user's own Anthropic key, held in this browser and nowhere else.
//
// It is deliberately not sent to our own API to be stored, and there is no endpoint that would
// accept it if it were. It goes out on the one request that needs it, as a header, and the only
// copy that persists is the one in this browser's localStorage.
//
// That is a real trade rather than a purity exercise. Storing other people's API keys means
// holding credentials that can spend their money, which is a liability worth a great deal more
// than the convenience of not re-pasting a key on a new device. The cost is exactly that: a key
// entered on a laptop is not there on a phone. Worth it.
//
// localStorage rather than sessionStorage because a key that has to be re-pasted every time the
// tab is closed would not be used, and a feature nobody uses protects nobody.

const STORAGE_KEY = "webxlights.anthropicKey";

/**
 * The browser's storage, if there is one.
 *
 * Reached through `globalThis` rather than `window` so this file makes no assumption about
 * running on a page - a worker has `localStorage` and no `window`, and neither does a test
 * runner without a DOM. Every caller already has to handle "no storage" for the private-window
 * case, so having one more way to get that answer costs nothing.
 */
function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    // Browsers set to block site data throw on the accessor itself, not on the call.
    return null;
  }
}

/** Reads the stored key, or null. Storage can throw in a private window, so this never does. */
export function loadKey(): string | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const trimmed = raw?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

export function saveKey(key: string): void {
  try {
    const trimmed = key.trim();
    const store = storage();
    if (!store) return;
    if (trimmed === "") store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, trimmed);
  } catch {
    // A browser refusing to store it is not a reason to fail the request the user just made.
  }
}

export function forgetKey(): void {
  saveKey("");
}

/**
 * Whether a string looks like an Anthropic key, for a hint next to the input.
 *
 * Deliberately a hint and not a gate. Key formats change, and a client that refuses to send
 * anything it doesn't recognise breaks the day a new prefix ships - with the user staring at a
 * key that is perfectly valid. The server and Anthropic decide; this only catches the obvious
 * paste error.
 */
export function looksLikeKey(key: string): boolean {
  return /^sk-ant-\S{8,}$/.test(key.trim());
}

/**
 * Shows a key without showing it - `sk-ant-…4f2a`.
 *
 * So someone with several keys can tell which one is in this browser without the whole secret
 * sitting on screen in a room, a screen share, or a screenshot attached to a bug report.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

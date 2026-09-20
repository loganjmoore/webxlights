import { isColorCurve, type StoredSwatch } from "@webxlights/engine";
import type { SequenceBody } from "./api";
import { filterRanked } from "./listFilter";

// Adding an effect without a trip to the palette.
//
// Drag out a span on a row and a picker opens where the pointer already is: the effects this
// sequence uses most, then every other one, all of it searchable from the keyboard. Until one is
// chosen the span holds a placeholder, and if none ever is, it stays one.
//
// A sequence is mostly the same dozen effects in the same few palettes, so what the picker offers
// first is counted from the sequence itself rather than configured: the list is right on the
// first day and stays right as the show changes.

/**
 * The effect a dragged-out span holds until one is chosen.
 *
 * Not an xLights effect, and deliberately not in the engine's schemas: the renderer leaves a name
 * it doesn't know transparent, which is exactly what "does nothing" has to mean on a layer above
 * other effects. The XSQ export leaves placeholders out, because xLights would turn one into Off,
 * and Off paints black.
 */
export const PLACEHOLDER_EFFECT = "Placeholder";

export function isPlaceholder(effect: { name: string }): boolean {
  return effect.name === PLACEHOLDER_EFFECT;
}

/** How many of the most used effects are listed ahead of the rest. */
export const MOST_USED_EFFECTS = 6;

function ranked<T>(counts: Map<string, { value: T; count: number }>): { value: T; count: number }[] {
  // Insertion order breaks ties, so two effects used equally keep the order they first appear in
  // the sequence instead of trading places from one edit to the next.
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function tally<T>(counts: Map<string, { value: T; count: number }>, key: string, value: T): void {
  const entry = counts.get(key);
  if (entry) entry.count++;
  else counts.set(key, { value, count: 1 });
}

/** How often each effect is used in the sequence, most used first. */
export function effectUsage(body: SequenceBody): { name: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const row of body.rows) {
    for (const effect of row.effects) if (!isPlaceholder(effect)) tally(counts, effect.name, effect.name);
  }
  return ranked(counts).map(({ value, count }) => ({ name: value, count }));
}

/** What the picker opens beside, in viewport pixels: a row of the grid, or the button that asked. */
export interface PickerAnchor {
  x: number;
  top: number;
  bottom: number;
}

export interface PickerItem {
  name: string;
  /** Times used in this sequence. */
  count: number;
  /** One of the sequence's most used, listed ahead of the rest. */
  mostUsed: boolean;
}

/**
 * What the picker lists: the most used effects, then the rest in the palette's own order.
 *
 * A query ranks the same list (lib/listFilter.ts), and because ties keep the list's order, two
 * equally good matches come out most-used first without a second rule.
 */
export function pickerItems(effectNames: readonly string[], usage: readonly { name: string; count: number }[], query: string): PickerItem[] {
  // Only effects that can be placed: an imported sequence can carry names with no renderer here.
  const placeable = new Set(effectNames);
  const counts = new Map(usage.filter((u) => placeable.has(u.name)).map((u) => [u.name, u.count]));
  const mostUsed = [...counts.keys()].slice(0, MOST_USED_EFFECTS);
  const first = new Set(mostUsed);
  const ordered = [...mostUsed, ...effectNames.filter((name) => !first.has(name))];
  return filterRanked(ordered, query, (name) => name).map((name) => ({
    name,
    count: counts.get(name) ?? 0,
    mostUsed: first.has(name),
  }));
}

/** The colour a swatch shows as: itself, or a curve's first marker. */
export function swatchHex(entry: StoredSwatch): string {
  return typeof entry === "string" ? entry : (entry.points[0]?.color ?? "#ffffff");
}

/** The palettes effects in this sequence carry, most used first. */
export function paletteUsage(body: SequenceBody): { palette: StoredSwatch[]; count: number }[] {
  const counts = new Map<string, { value: StoredSwatch[]; count: number }>();
  for (const row of body.rows) {
    for (const effect of row.effects) {
      if (effect.palette?.length) tally(counts, JSON.stringify(effect.palette), effect.palette);
    }
  }
  return ranked(counts).map(({ value, count }) => ({ palette: value, count }));
}

/** The single colours those palettes are made of, most used first. */
export function colorUsage(body: SequenceBody): { color: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const row of body.rows) {
    for (const effect of row.effects) {
      for (const entry of effect.palette ?? []) {
        const color = swatchHex(entry).toLowerCase();
        tally(counts, color, color);
      }
    }
  }
  return ranked(counts).map(({ value, count }) => ({ color: value, count }));
}

/**
 * `next`, in the order `shown` already has it, with anything new on the end.
 *
 * The quick colours are ranked by use, and using one changes the ranking - so a list that simply
 * re-sorted would move under the pointer between one click and the next, and the second click of
 * "red, then white" would land on whatever had just taken white's place.
 */
export function keepOrder<T>(shown: readonly T[], next: readonly T[], same: (a: T, b: T) => boolean): T[] {
  return [...shown.filter((s) => next.some((n) => same(s, n))), ...next.filter((n) => !shown.some((s) => same(s, n)))];
}

export function samePalette(a: readonly StoredSwatch[], b: readonly StoredSwatch[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A palette of its own, so an effect never shares a colour curve with the chip it came from. */
export function clonePalette(palette: readonly StoredSwatch[]): StoredSwatch[] {
  return JSON.parse(JSON.stringify(palette)) as StoredSwatch[];
}

// Saved palettes: the ones you like enough to keep. In localStorage for the reason preferences
// are (lib/preferences.ts): a favourite belongs to the person at the keyboard, and it should be
// there in every show they open, not only the one it was saved from.

const STORAGE_KEY = "webxlights.savedPalettes";

/**
 * What the saved palettes start as, so the first effect of the first sequence has colours on offer
 * rather than an empty row. Full-strength primaries, because that is what pixels are driven with.
 * They are ordinary saved palettes from then on: forget the ones you don't want.
 */
export const STARTER_PALETTES: StoredSwatch[][] = [
  ["#ff0000", "#00ff00", "#ffffff"],
  ["#ff0000", "#ffffff"],
  ["#0000ff", "#00ffff", "#ffffff"],
  ["#ffd27f", "#ff9900"],
  ["#ff6a00", "#8000ff", "#00ff00"],
  ["#ff0000", "#ff8000", "#ffff00", "#00ff00", "#0000ff", "#8000ff"],
];

export const MAX_SAVED_PALETTES = 24;
/** xLights' own limit: "Some support just one, some support up to 8." */
const MAX_SWATCHES = 8;

function isSwatch(entry: unknown): entry is StoredSwatch {
  return (typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry)) || isColorCurve(entry);
}

/** Keeps what is a palette and drops what isn't, so a hand-edited bag can't break the picker. */
export function sanitizePalettes(value: unknown): StoredSwatch[][] {
  if (!Array.isArray(value)) return [];
  const out: StoredSwatch[][] = [];
  for (const palette of value) {
    if (!Array.isArray(palette) || palette.length === 0 || palette.length > MAX_SWATCHES || !palette.every(isSwatch)) continue;
    if (!out.some((kept) => samePalette(kept, palette))) out.push(palette);
  }
  return out.slice(0, MAX_SAVED_PALETTES);
}

export function loadSavedPalettes(storage: Pick<Storage, "getItem"> | null | undefined): StoredSwatch[][] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    // Nothing stored yet is not the same as an emptied list: only the first gets the starters.
    return raw ? sanitizePalettes(JSON.parse(raw)) : clonePalettes(STARTER_PALETTES);
  } catch {
    // A corrupt bag is a preference problem, not a reason to fail to open the sequencer.
    return clonePalettes(STARTER_PALETTES);
  }
}

function clonePalettes(palettes: readonly StoredSwatch[][]): StoredSwatch[][] {
  return palettes.map(clonePalette);
}

export function saveSavedPalettes(storage: Pick<Storage, "setItem"> | null | undefined, palettes: StoredSwatch[][]): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizePalettes(palettes)));
  } catch {
    // Private browsing, a full quota - neither is worth interrupting an edit over.
  }
}

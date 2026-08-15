import type { SequenceEffect } from "./api";

// Copying and pasting a block of effects (manual: Sequencer > Changing An Effect).
//
// Block selection made the alignment commands possible; this is the other thing it makes possible,
// and the more useful of the two day to day. Copying eight effects across three props and dropping
// them on the second chorus is the bulk edit a sequencer exists for, and doing it one effect at a
// time is how an afternoon disappears.
//
// A clipboard of *relative* positions, not absolute ones: what gets pasted is the shape of the
// selection - how far apart the effects are and which rows they sit on relative to the topmost -
// so it can land anywhere and on any prop. Storing absolute times would only ever paste back where
// it came from.

export interface ClipboardEntry {
  effect: SequenceEffect;
  /** Milliseconds after the earliest effect in the copied block. */
  offsetMs: number;
  /** Rows below the topmost row in the copied block. */
  rowOffset: number;
}

export interface EffectClipboard {
  entries: ClipboardEntry[];
}

export interface SourceEffect {
  effect: SequenceEffect;
  rowIndex: number;
}

/**
 * A clipboard from the effects currently selected.
 *
 * Anchored on the earliest effect and the topmost row rather than on the reference effect: the
 * paste point is where the block *starts*, and anchoring on the reference would make pasting jump
 * backwards whenever the reference wasn't the first one selected.
 */
export function clipboardFrom(sources: readonly SourceEffect[]): EffectClipboard | null {
  if (sources.length === 0) return null;
  const earliest = Math.min(...sources.map((s) => s.effect.startMs));
  const topmost = Math.min(...sources.map((s) => s.rowIndex));
  return {
    entries: sources.map(({ effect, rowIndex }) => ({
      effect: JSON.parse(JSON.stringify(effect)) as SequenceEffect,
      offsetMs: effect.startMs - earliest,
      rowOffset: rowIndex - topmost,
    })),
  };
}

export interface PastedEffect {
  effect: SequenceEffect;
  rowIndex: number;
}

/**
 * Where a clipboard lands when pasted at a moment on a row.
 *
 * Row offsets are clamped to the rows that exist, so a block copied from the bottom of the grid
 * doesn't half-vanish when pasted lower down - the effects that would fall off pile onto the last
 * row instead, where they can be seen and moved. Silently dropping them would look like the paste
 * having partly failed.
 */
export function pastedAt(
  clipboard: EffectClipboard,
  atMs: number,
  rowIndex: number,
  rowCount: number,
  newId: () => string,
): PastedEffect[] {
  return clipboard.entries.map((entry) => {
    const startMs = Math.max(0, atMs + entry.offsetMs);
    const length = Math.max(0, entry.effect.endMs - entry.effect.startMs);
    const clone = JSON.parse(JSON.stringify(entry.effect)) as SequenceEffect;
    return {
      effect: { ...clone, id: newId(), startMs, endMs: startMs + length },
      rowIndex: Math.max(0, Math.min(rowCount - 1, rowIndex + entry.rowOffset)),
    };
  });
}

/** How many effects a clipboard holds, for the label on the paste command. */
export function clipboardSize(clipboard: EffectClipboard | null): number {
  return clipboard?.entries.length ?? 0;
}

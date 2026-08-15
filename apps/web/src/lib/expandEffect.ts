import type { SequenceEffect } from "./api";

// Expanding an effect to a timing mark (manual: appendix, Effect Manipulation).
//
// "CTRL + SHIFT + Right Arrow: Expand Effect to Next Timing Mark or End of the Sequence."
// "CTRL + SHIFT + Left Arrow: Expand Effect to Previous Timing Mark or Start of the Sequence."
//
// The most useful key in the appendix, because it is how an effect gets snapped to a beat without
// dragging: you place something roughly, then stretch it onto the timing exactly. Dragging can do
// it, but only as precisely as the zoom level allows, and at a working zoom a 50ms frame is a
// pixel wide.
//
// It *expands*: the far edge stays where it is. An effect that could shrink on this key would make
// the two arrows a pair of nudges, which is what the plain arrows already are.

export interface ExpandedEffect {
  startMs: number;
  endMs: number;
}

/**
 * Where an effect's edge lands when expanded towards a mark.
 *
 * Returns null when there is nowhere to go - already at the sequence bounds - so the caller can
 * leave the effect alone rather than rewriting it to the values it already had.
 *
 * The mark has to be strictly beyond the edge being moved: an effect whose end already sits on a
 * mark expands to the *next* one, not to where it is. Otherwise the key would appear dead on
 * exactly the effects most likely to be on a mark already.
 */
export function expandToMark(
  effect: Pick<SequenceEffect, "startMs" | "endMs">,
  marks: readonly number[],
  direction: -1 | 1,
  durationMs: number,
): ExpandedEffect | null {
  if (direction === 1) {
    const next = marks.filter((m) => m > effect.endMs).sort((a, b) => a - b)[0] ?? durationMs;
    if (next <= effect.endMs) return null;
    return { startMs: effect.startMs, endMs: next };
  }
  const previous = marks.filter((m) => m < effect.startMs).sort((a, b) => b - a)[0] ?? 0;
  if (previous >= effect.startMs) return null;
  return { startMs: previous, endMs: effect.endMs };
}

/**
 * The moment a "jump to N% through the song" key lands on.
 *
 * "CTRL + SHIFT + 0 - 9: Jump to 0%-90% through the song in the sequencer." Ten evenly spaced
 * landmarks, which is a coarse but instant way to get to roughly the right part of a long track -
 * the digit *is* the tenth, so 3 is always three tenths in however long the song is.
 */
export function jumpTargetMs(digit: number, durationMs: number): number {
  const tenth = Math.max(0, Math.min(9, Math.trunc(digit)));
  return Math.round((tenth / 10) * Math.max(0, durationMs));
}

// Aligning several effects (manual: Sequencer > Changing An Effect).
//
// "In order to align several effects to the same start or end times, drag a box around all the
// effects you want to align and then hold down shift and click the effect you want to be the
// reference. Then right click and select Alignment. You can then select one of the four options to
// align to the effect you selected as your reference."
//
// The four are start times, end times, both, and centrepoints. Three of them keep each effect's own
// length and only move it; "both" is the one that changes durations, which is why it is worth
// having as a separate option rather than being what "align" means.
//
// Alignment is the payoff of block selection: getting twelve effects to start on the same beat by
// dragging each one is the kind of task that makes people give up on a sequencer.

export type AlignMode = "start" | "end" | "both" | "center";

export const ALIGN_MODES: { mode: AlignMode; label: string }[] = [
  { mode: "start", label: "Align Start Times" },
  { mode: "end", label: "Align End Times" },
  { mode: "both", label: "Align Both Times" },
  { mode: "center", label: "Align Centrepoints" },
];

export interface Timed {
  startMs: number;
  endMs: number;
}

/**
 * Where an effect lands when aligned to a reference.
 *
 * Every mode but "both" preserves the effect's own duration, because an effect that silently got
 * longer when you asked for its start to move would be a surprise you'd have to undo - and the
 * mode that does change durations is the one you asked for by name.
 *
 * Never moves an effect before zero: a start clamped at the front is a visible result, where a
 * negative start is an effect that vanishes off the left of the grid with nothing to grab.
 */
export function alignedTo(reference: Timed, effect: Timed, mode: AlignMode): Timed {
  const length = Math.max(0, effect.endMs - effect.startMs);

  if (mode === "both") {
    return { startMs: Math.max(0, reference.startMs), endMs: Math.max(reference.endMs, reference.startMs) };
  }

  let startMs: number;
  if (mode === "start") startMs = reference.startMs;
  else if (mode === "end") startMs = reference.endMs - length;
  else startMs = (reference.startMs + reference.endMs) / 2 - length / 2;

  const clamped = Math.max(0, Math.round(startMs));
  return { startMs: clamped, endMs: clamped + length };
}

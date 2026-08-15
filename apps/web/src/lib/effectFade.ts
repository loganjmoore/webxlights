import type { TransitionSpec } from "@webxlights/engine";

// Shift-dragging an effect edge to author a fade (manual: Sequencer > Changing An Effect).
//
// "Hold the Shift key and drag the left edge of an effect inwards to create a fade in, or drag the
// right edge inwards to create a fade out."
//
// Which is a gesture we could already express: the transition system has in and out durations, and
// the grid draws them as wedges. What was missing was any way to set them by eye. Typing a number
// into the panel and looking at the result is a poor way to answer "how long should this fade be",
// because the answer is "until it stops sounding abrupt" - which you find by dragging.
//
// "Inwards" is the whole gesture: the distance dragged in from the edge *is* the fade length, and
// dragging back out to the edge takes it away again.

export type FadeEdge = "left" | "right";

export interface TimedEffect {
  startMs: number;
  endMs: number;
  transition?: TransitionSpec;
}

/**
 * The fade length a pointer position means, in milliseconds.
 *
 * Measured inwards from the edge being dragged, so it is zero at the edge and grows as the pointer
 * moves into the effect. Dragging outwards past the edge gives zero rather than a negative, which
 * is how the fade is removed.
 *
 * Capped so the two fades can't overlap: an in and an out that cross would ask the renderer to
 * reveal and hide the same frames at once, and what that looks like is not something anyone chose.
 */
export function fadeDurationAt(effect: TimedEffect, edge: FadeEdge, ms: number): number {
  const length = Math.max(0, effect.endMs - effect.startMs);
  const other = edge === "left" ? (effect.transition?.outDurationMs ?? 0) : (effect.transition?.inDurationMs ?? 0);
  const room = Math.max(0, length - Math.max(0, Math.min(other, length)));
  const dragged = edge === "left" ? ms - effect.startMs : effect.endMs - ms;
  return Math.round(Math.max(0, Math.min(dragged, room)));
}

/**
 * The transition an effect should carry after a fade drag.
 *
 * Keeps whatever reveal type is already set, so shift-dragging the edge of an effect someone gave
 * a Circle Explode adjusts *that* rather than silently turning it into a fade. Only an effect with
 * no transition at all gets one made for it, and then it is a plain Fade - which is what the
 * gesture is named after.
 *
 * Returns undefined when a transition this gesture created has been dragged back to nothing, so an
 * undone fade leaves no empty object behind to puzzle over in the panel.
 */
export function withFade(transition: TransitionSpec | undefined, edge: FadeEdge, durationMs: number): TransitionSpec | undefined {
  const next: TransitionSpec = { ...transition };
  if (edge === "left") next.inDurationMs = durationMs;
  else next.outDurationMs = durationMs;

  const nothingLeft = !(next.inDurationMs ?? 0) && !(next.outDurationMs ?? 0);
  // Only cleared when there was nothing to begin with: an effect whose reveal *type* was chosen
  // deliberately keeps that choice even at zero length, or setting a fade to nothing would throw
  // away a setting the gesture never touched.
  if (nothingLeft && transition === undefined) return undefined;
  return next;
}

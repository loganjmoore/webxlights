// Zooming and scrolling the timeline (manual: Sequencer > Timeline and Waveform).
//
// "Zoom in on the waveform by double clicking on the waveform." / "To zoom out, hold the shift key
// and double click on the waveform or click on the '-' button." / "Click the edge of an effect,
// hold down control and use the mouse scroll wheel to go in or out." / "Right-click the timeline
// to reset the zoom level." / "Click on the waveform. Then hold down the Shift key and use the
// scroll key of the mouse to move the waveform and grid left or right."
//
// Five gestures for two operations, which is what a timeline needs: at a working zoom a
// four-minute song is many screens wide, and reaching for a scrollbar between every edit is the
// thing that makes a sequencer feel slow.
//
// The arithmetic is here rather than in the page because the anchoring is the part that has to be
// right. Zooming that doesn't hold a point still throws you somewhere else in the song every time
// you zoom, which makes the gesture useless exactly when it matters - working on one bar.

/**
 * The zoom ladder, as a multiple of fit-to-width.
 *
 * Wider than the three levels this had. 2x is nowhere near enough to place an effect against a
 * 50ms frame in a four-minute song, and 0.25x is what "show me the whole thing" means for one.
 * Powers of two so a step is always the same visual jump.
 */
export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

/** The index of 1x - fit to width, and where a sequence opens. */
export const DEFAULT_ZOOM_INDEX = 2;

export function zoomIndexIn(index: number): number {
  return Math.min(ZOOM_STEPS.length - 1, index + 1);
}

export function zoomIndexOut(index: number): number {
  return Math.max(0, index - 1);
}

/** Clamps a stored or hand-set index onto the ladder. */
export function clampZoomIndex(index: number): number {
  if (!Number.isFinite(index)) return DEFAULT_ZOOM_INDEX;
  return Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(index)));
}

/**
 * The scroll offset that keeps a moment under the same point on screen across a zoom change.
 *
 * `pointerOffsetPx` is where the pointer is within the *viewport* (its client x minus the
 * viewport's left edge), and `labelWidthPx` is the row-label gutter the timeline starts after.
 *
 * Without this, zooming in on the second chorus lands you in the first verse, because the content
 * grows from its left edge and the viewport stays where it was.
 */
export function scrollLeftHolding(
  anchorMs: number,
  pointerOffsetPx: number,
  newPxPerMs: number,
  labelWidthPx: number,
  maxScrollPx: number,
): number {
  const anchorContentX = labelWidthPx + anchorMs * newPxPerMs;
  return Math.max(0, Math.min(maxScrollPx, anchorContentX - pointerOffsetPx));
}

/**
 * How far a shift+wheel gesture should scroll.
 *
 * Takes whichever wheel axis moved: a mouse reports the shift-modified scroll on deltaX on some
 * platforms and deltaY on others, and a trackpad reports both. Taking the larger magnitude means
 * the gesture works the same everywhere instead of on whichever machine it was written on.
 */
export function wheelScrollDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
}

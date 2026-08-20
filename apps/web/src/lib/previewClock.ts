// The popped-out preview's own clock.
//
// The preview window is a follower: the sequencer tab owns the audio and broadcasts where the
// playhead is. That works right up until you *look* at the preview - which puts the sequencer tab
// in the background, and browsers stop `requestAnimationFrame` entirely in a hidden tab. The tab
// driving the clock goes to sleep exactly when the tab being watched needs it most, so the preview
// freezes on whatever frame it was last sent.
//
// So the preview runs its own clock between messages and treats each message as a correction. The
// tab you are looking at is always foreground, so its own frames always run.

export interface TransportAnchor {
  /** Where the playhead was when this anchor was taken. */
  playheadMs: number;
  /** `performance.now()` at that moment - a local reading, never the sender's clock. */
  at: number;
  playing: boolean;
}

/**
 * Where the playhead is now, given the last thing the sequencer told us.
 *
 * Paused means paused: the anchor is the answer, with no drift. Only a running transport
 * extrapolates, and only forwards - a `now` before the anchor (a clock adjustment, a stale call)
 * holds at the anchor rather than running the sequence backwards.
 */
export function playheadAt(anchor: TransportAnchor, now: number, durationMs?: number): number {
  if (!anchor.playing) return anchor.playheadMs;
  const elapsed = Math.max(0, now - anchor.at);
  const ms = anchor.playheadMs + elapsed;
  // Held at the end rather than running past it. The sequencer stops itself there and will say so
  // in its next message; until that arrives this shouldn't be showing a time the sequence doesn't
  // have.
  return durationMs !== undefined && durationMs > 0 ? Math.min(ms, durationMs) : ms;
}

/**
 * Whether a correction is worth applying.
 *
 * Every message would otherwise re-anchor, and a message that agrees with the local clock to
 * within a frame is one that only adds jitter: the two clocks are already the same, and snapping
 * to a value a few milliseconds either side of where the animation already is shows up as a
 * stutter rather than as accuracy.
 */
export function shouldResync(localMs: number, reportedMs: number, frameMs: number): boolean {
  return Math.abs(localMs - reportedMs) > Math.max(frameMs, 1);
}

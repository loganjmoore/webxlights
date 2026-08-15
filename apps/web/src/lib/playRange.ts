// The play range: a highlighted section of the waveform that plays on its own, on a loop.
//
// The manual: "Highlighting a portion of the waveform will cause only that section to be played.
// Pressing the spacebar will replay that section... The 'Replay' button will replay the highlighted
// section of the waveform. It will start from the beginning of the highlighted area and when it
// reaches the end of the area, will loop back to play from the beginning of that area."
//
// Which is the point of it: you work on one chorus by hearing it over and over, and without the
// loop that means reaching for the mouse every eight seconds.
//
// The rules live here rather than in the component so they can be checked without an audio
// element - "where should the playhead be" is arithmetic, and the two callers (starting play, and
// every time update) have to agree about it.

export interface PlayRange {
  startMs: number;
  endMs: number;
}

/** How far outside the range the playhead may sit before a seek is treated as leaving it. */
const LEAVE_TOLERANCE_MS = 100;

/**
 * Where play should start, or null to carry on from where the playhead is.
 *
 * A range means play *that*, so pressing play with the playhead somewhere else jumps into the
 * range rather than ignoring the highlight. Inside it already, it carries on - otherwise pausing
 * mid-phrase and pressing play would always throw you back to the start of the range.
 */
export function startOfPlay(range: PlayRange | null, playheadMs: number): number | null {
  if (!range) return null;
  if (playheadMs >= range.startMs && playheadMs < range.endMs) return null;
  return range.startMs;
}

/**
 * Where the playhead should jump to as it plays, or null to leave it alone.
 *
 * Loops at the end. Also catches the playhead being *before* the range - a seek during playback -
 * but only past a tolerance, so the ordinary case of playing the first frames of the range isn't
 * mistaken for having left it.
 */
export function loopWithin(range: PlayRange | null, playheadMs: number, playing: boolean): number | null {
  if (!range || !playing) return null;
  if (playheadMs >= range.endMs) return range.startMs;
  if (playheadMs < range.startMs - LEAVE_TOLERANCE_MS) return range.startMs;
  return null;
}

/**
 * A range from a drag, or null when it is too short to be one.
 *
 * A few pixels of jitter shouldn't become a range nothing can be played from, and a zero-length
 * one would loop forever without advancing.
 */
export function rangeFromDrag(fromMs: number, toMs: number, minimumMs = 50): PlayRange | null {
  const startMs = Math.max(0, Math.min(fromMs, toMs));
  const endMs = Math.max(fromMs, toMs);
  return endMs - startMs > minimumMs ? { startMs, endMs } : null;
}

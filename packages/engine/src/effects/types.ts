import type { AudioFrame } from "../audio";
import { SILENT_AUDIO_FRAME } from "../audio";
import type { ModelNode } from "../models/types";
import type { StateEntry } from "../models/states";
import type { TimingLabel } from "../timing";

// Shared per-frame context for all effects. `seed` feeds the deterministic RNG helpers
// (rng.ts) - same seed => identical frames (SPEC ch10/16 determinism requirement).
export interface FrameContext {
  frameIndexInEffect: number; // frames since effect start
  positionInEffect01: number; // 0..1 across effect duration
  seed: number; // per-(model,layer,effect-instance) RNG seed
  // Analysed audio for the frame being rendered (audio.ts). Absent when the sequence has no
  // audio loaded; audio-reactive effects fall back to silence rather than failing to render.
  audio?: AudioFrame;
  // Wall-clock position, for the effects whose source is the sequence's own timeline rather than
  // their own parameters. `positionInEffect01` can't stand in: a countdown counts real seconds,
  // and a timing cell is at an absolute millisecond.
  clock?: EffectClock;
  // Things that come from the sequence or the model rather than from the effect's parameters -
  // the timing track an effect names, and the model's own state definitions.
  data?: EffectData;
  // Where each of the model's nodes sits in this buffer. Effects address pixels, not nodes, which
  // is right for all but the handful that light *particular nodes by number* - a state's node
  // ranges, a face's mouth. Those need to find the node's pixel, so they are handed the map.
  nodes?: readonly ModelNode[];
}

export interface EffectClock {
  atMs: number; // absolute playhead
  startMs: number; // effect bounds, so an effect can measure elapsed real time
  endMs: number;
}

// Per-effect data resolved by the caller, because the engine renders one row at a time and has no
// view of the sequence's timing tracks or the model's properties.
export interface EffectData {
  /** The labelled cells of the timing track this effect names (timing.ts). */
  timing?: readonly TimingLabel[];
  /** The entries of the model state definition this effect names (models/states.ts). */
  states?: readonly StateEntry[];
}

export function audioOf(ctx: FrameContext): AudioFrame {
  return ctx.audio ?? SILENT_AUDIO_FRAME;
}

// SPEC's `GetEffectTimeIntervalPosition(cycles)`: 0..1 sawtooth repeated `cycles` times
// across the effect's duration.
export function effectTimeIntervalPosition(position01: number, cycles: number): number {
  const x = position01 * cycles;
  return x - Math.floor(x);
}

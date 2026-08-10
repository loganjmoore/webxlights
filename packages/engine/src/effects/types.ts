// Shared per-frame context for all effects. `seed` feeds the deterministic RNG helpers
// (rng.ts) - same seed => identical frames (SPEC ch10/16 determinism requirement).
export interface FrameContext {
  frameIndexInEffect: number; // frames since effect start
  positionInEffect01: number; // 0..1 across effect duration
  seed: number; // per-(model,layer,effect-instance) RNG seed
}

// SPEC's `GetEffectTimeIntervalPosition(cycles)`: 0..1 sawtooth repeated `cycles` times
// across the effect's duration.
export function effectTimeIntervalPosition(position01: number, cycles: number): number {
  const x = position01 * cycles;
  return x - Math.floor(x);
}

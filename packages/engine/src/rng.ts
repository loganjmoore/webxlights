// SPEC ch10/ch16: "per-buffer seeded RNG" for determinism (same seed => identical frames).
// mulberry32 is a small, fast, well-distributed PRNG - not xLights' exact algorithm (closed
// source internals), but satisfies the same contract: seeded, deterministic, reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless "hash RNG" keyed on (seed, key) - used where SPEC calls for per-pixel/per-frame
// randomness without carrying RNG state across calls (e.g. Fire's New Render Method, Meteors'
// rainbow trail hues, Twinkle's hash-shuffle). Same (seed,key) always -> same value.
export function hashRandom01(seed: number, key: number): number {
  let h = (seed ^ (key * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hashRandomInt(seed: number, key: number, maxExclusive: number): number {
  return Math.floor(hashRandom01(seed, key) * maxExclusive);
}

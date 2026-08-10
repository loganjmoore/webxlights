import type { RenderBuffer } from "./renderBuffer";

// SPEC ch9 "layer transitions": In/Out fades applied to a layer independent of what the
// effect itself draws. ponytail: Fade only (Wipe/From Middle/Circle Explode are a documented
// ceiling - Fade is the simplest and most common transition).
export interface TransitionSpec {
  inDurationMs?: number;
  outDurationMs?: number;
}

export function applyFadeTransition(
  buffer: RenderBuffer,
  effect: { startMs: number; endMs: number },
  atMs: number,
  transition: TransitionSpec,
): void {
  const inDur = transition.inDurationMs ?? 0;
  const outDur = transition.outDurationMs ?? 0;
  let factor = 1;

  if (inDur > 0) {
    const t = (atMs - effect.startMs) / inDur;
    factor = Math.min(factor, Math.max(0, Math.min(1, t)));
  }
  if (outDur > 0) {
    const t = (effect.endMs - atMs) / outDur;
    factor = Math.min(factor, Math.max(0, Math.min(1, t)));
  }
  if (factor >= 1) return;

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const c = buffer.getPixel(x, y);
      if (c.a === 0) continue;
      buffer.setPixel(x, y, { ...c, a: Math.round(c.a * factor) });
    }
  }
}

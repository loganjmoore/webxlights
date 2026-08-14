import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";

export interface SnowStormParams {
  maxFlakes: number; // 1-100, relative particle count
  trailLength: number; // frames of trail behind each particle
  speed: number; // 1-100
}

export interface SnowStormState {
  particles: Array<{ x: number; y: number; vx: number; vy: number; color: number }>;
  trail: Array<Array<{ x: number; y: number }>>;
}

// Manual "Snow Storm": particles blowing, like an ice or dust storm - distinct from Snowflakes,
// which fall. These drift sideways as much as down, and each leaves a trail that fades out.
//
// Stateful, like Meteors and Snowflakes: the particle positions carry from frame to frame, so
// this is driven through the engine's incremental-state path rather than recomputed from the
// frame index (renderFrame.ts).
export function createSnowStormState(width: number, height: number, params: SnowStormParams, seed: number): SnowStormState {
  const rng = mulberry32(seed);
  const count = particleCount(width, height, params.maxFlakes);
  const particles: SnowStormState["particles"] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rng() * width,
      y: rng() * height,
      // Mostly horizontal, because a storm blows rather than falls; the vertical drift is what
      // stops it looking like a plain sideways chase.
      vx: (rng() * 2 - 1) * 0.6 - 0.4,
      vy: (rng() * 2 - 1) * 0.35,
      color: Math.floor(rng() * 8),
    });
  }
  return { particles, trail: particles.map(() => []) };
}

function particleCount(width: number, height: number, maxFlakes: number): number {
  const pct = Math.min(100, Math.max(1, maxFlakes)) / 100;
  return Math.max(1, Math.round(width * height * 0.25 * pct));
}

export function renderSnowStorm(
  buffer: RenderBuffer,
  palette: RGBA[],
  params: SnowStormParams,
  state: SnowStormState,
): void {
  const { width: W, height: H } = buffer;
  const speed = Math.min(100, Math.max(1, params.speed)) / 20;
  const trailLength = Math.max(0, Math.round(params.trailLength));

  state.particles.forEach((p, i) => {
    const history = state.trail[i] ?? (state.trail[i] = []);
    history.unshift({ x: p.x, y: p.y });
    if (history.length > trailLength + 1) history.length = trailLength + 1;

    p.x += p.vx * speed;
    p.y += p.vy * speed;
    // Wrapping rather than respawning keeps the storm's density constant; a storm that thinned
    // out as particles left the edges would fade rather than blow.
    p.x = ((p.x % W) + W) % W;
    p.y = ((p.y % H) + H) % H;

    const base = palette[p.color % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);
    history.forEach((point, age) => {
      const fade = 1 - age / (trailLength + 1);
      buffer.setPixel(Math.floor(point.x), Math.floor(point.y), { ...base, a: Math.round(255 * fade) });
    });
  });
}

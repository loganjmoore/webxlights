import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";

export interface SnowflakesParams {
  speed: number; // 0-50
}

interface Flake {
  x: number;
  y: number;
}

export interface SnowflakesState {
  flakes: Flake[];
  rng: () => number;
}

// SPEC ch8 "Snowflakes", Type=1 (single pixel) + Falling mode only. Driving/Accumulating
// modes and shapes 0/2-9 (plus/diamond/cluster/etc) are a documented ceiling.
export function createSnowflakesState(width: number, height: number, count: number, seed: number): SnowflakesState {
  const rng = mulberry32(seed);
  const flakes: Flake[] = [];
  for (let i = 0; i < count; i++) {
    flakes.push({ x: Math.floor(rng() * width), y: Math.floor(rng() * height) });
  }
  return { flakes, rng };
}

export function renderSnowflakes(buffer: RenderBuffer, palette: RGBA[], params: SnowflakesParams, state: SnowflakesState): void {
  const { width: W, height: H } = buffer;
  const step = Math.max(1, Math.round(params.speed / 10));
  const color = palette[0] ?? rgba(255, 255, 255, 255);

  for (const f of state.flakes) {
    f.y -= step;
    if (f.y < 0) {
      f.y = H - 1;
      f.x = Math.floor(state.rng() * W);
    }
    const dir = state.rng();
    if (dir < 0.33) f.x = (f.x - 1 + W) % W;
    else if (dir < 0.66) f.x = (f.x + 1) % W;
  }

  for (const f of state.flakes) buffer.setPixel(f.x, f.y, color);
}

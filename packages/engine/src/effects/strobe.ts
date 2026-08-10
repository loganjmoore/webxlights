import type { RGBA } from "../color";
import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";

export interface StrobeParams {
  numberStrobes: number; // 1-300
  duration: number; // 1-100 frames
  type: 1 | 2 | 3 | 4; // 1=pixel, 2=cross-arm, 3=full plus, 4=alternating plus/X
}

interface StrobeLight {
  x: number;
  y: number;
  remaining: number;
  color: RGBA;
}

export interface StrobeState {
  strobes: StrobeLight[];
  rng: () => number;
  initialized: boolean;
}

export function createStrobeState(seed: number): StrobeState {
  return { strobes: [], rng: mulberry32(seed), initialized: false };
}

// SPEC ch8 "Strobe". Types 1/3/4 implemented faithfully; type 2's per-strobe coin-flip
// orientation is simplified to always-vertical-pair (documented ceiling).
export function renderStrobe(buffer: RenderBuffer, palette: RGBA[], params: StrobeParams, state: StrobeState): void {
  const { width: W, height: H } = buffer;
  const duration = Math.max(1, params.duration);
  const poolTarget = Math.max(1, params.numberStrobes) * duration;

  const spawn = (dur: number) => {
    const x = Math.floor(state.rng() * W);
    const y = Math.floor(state.rng() * H);
    const color = palette.length > 0 ? palette[Math.floor(state.rng() * palette.length)]! : rgba(255, 255, 255, 255);
    state.strobes.push({ x, y, remaining: dur, color });
  };

  if (!state.initialized) {
    for (let i = 0; i < poolTarget; i++) spawn((i % duration) + 1);
    state.initialized = true;
  } else {
    while (state.strobes.length < poolTarget) spawn(duration);
  }

  for (const s of state.strobes) {
    const v = s.remaining >= 3 ? 1 : s.remaining === 2 ? 0.75 : 0.5;
    const armColor: RGBA = { ...s.color, a: Math.round(255 * v) };
    buffer.setPixel(s.x, s.y, s.color);

    if (params.type === 2) {
      buffer.setPixel(s.x, s.y - 1, armColor);
      buffer.setPixel(s.x, s.y + 1, armColor);
    } else if (params.type === 3) {
      buffer.setPixel(s.x - 1, s.y, armColor);
      buffer.setPixel(s.x + 1, s.y, armColor);
      buffer.setPixel(s.x, s.y - 1, armColor);
      buffer.setPixel(s.x, s.y + 1, armColor);
    } else if (params.type === 4) {
      const usePlus = state.rng() < 0.5;
      if (usePlus) {
        buffer.setPixel(s.x - 1, s.y, armColor);
        buffer.setPixel(s.x + 1, s.y, armColor);
        buffer.setPixel(s.x, s.y - 1, armColor);
        buffer.setPixel(s.x, s.y + 1, armColor);
      } else {
        buffer.setPixel(s.x - 1, s.y - 1, armColor);
        buffer.setPixel(s.x + 1, s.y - 1, armColor);
        buffer.setPixel(s.x - 1, s.y + 1, armColor);
        buffer.setPixel(s.x + 1, s.y + 1, armColor);
      }
    }
  }

  for (const s of state.strobes) s.remaining--;
  state.strobes = state.strobes.filter((s) => s.remaining > 0);
}

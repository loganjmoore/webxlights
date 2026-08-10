import type { RGBA } from "../color";
import { hsvToRgb } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface FireParams {
  height: number; // 1-100, flame height %
  hueShift: number; // 0-100
  growthCycles: number; // 0-20, triangle-wave height modulation
}

// Persists across frames (Old Render Method is fully serial/stateful). Caller owns the
// lifetime (one per model+layer+effect-instance) and must call createFireState once.
export interface FireState {
  buf: Uint8Array; // width*height, palette indices 0-199, row-major, row 0 = base (bufY=0)
  rng: () => number;
}

export function createFireState(width: number, height: number, seed: number): FireState {
  return { buf: new Uint8Array(width * height), rng: mulberry32(seed) };
}

function buildFireLut(hueShift: number): RGBA[] {
  const lut: RGBA[] = new Array(200);
  for (let i = 0; i < 100; i++) {
    const hue = Math.min(1, 0 + hueShift / 100);
    lut[i] = hsvToRgb(hue * 360, 1, i / 100);
  }
  for (let i = 100; i < 200; i++) {
    const baseHue = (i - 100) * 0.00166666;
    const hue = Math.min(1, baseHue + hueShift / 100);
    lut[i] = hsvToRgb(hue * 360, 1, 1);
  }
  return lut;
}

function meanTaps(buf: Uint8Array, W: number, x: number, y: number): number {
  const taps: number[] = [];
  if (y - 1 >= 0) {
    if (x - 1 >= 0) taps.push(buf[(y - 1) * W + (x - 1)]!);
    taps.push(buf[(y - 1) * W + x]!);
    if (x + 1 < W) taps.push(buf[(y - 1) * W + (x + 1)]!);
  }
  if (y - 2 >= 0) taps.push(buf[(y - 2) * W + x]!);
  if (taps.length === 0) return 0;
  return taps.reduce((a, b) => a + b, 0) / taps.length;
}

// SPEC ch7 "Fire", Old Render Method only (New Render Method's frame-to-frame top-down pass
// + GrowWithMusic + Location remap are a documented ceiling - Old is fully serial/deterministic
// and covers the classic flicker-in-place simulation).
export function renderFire(buffer: RenderBuffer, params: FireParams, ctx: FrameContext, state: FireState): void {
  const { width: W, height: H } = buffer;
  const heightPct = Math.max(
    1,
    params.height +
      (params.growthCycles > 0
        ? (0.5 - Math.abs(effectTimeIntervalPosition(ctx.positionInEffect01, params.growthCycles) - 0.5)) * 100
        : 0),
  );
  const step = Math.max(1, Math.floor(25500 / (H * heightPct)));

  // row 0: random hot seed
  for (let x = 0; x < W; x++) {
    state.buf[x] = 150 + Math.floor(state.rng() * 50);
  }
  // rows bottom-up, in-place (reads same-pass writes -> serial flicker-in-place)
  for (let y = 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = meanTaps(state.buf, W, x, y);
      if (v > 0) {
        v += state.rng() * 100 < 20 ? step : -step;
        v = Math.max(0, Math.min(199, v));
      }
      state.buf[y * W + x] = Math.round(v);
    }
  }

  const lut = buildFireLut(params.hueShift);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      buffer.setPixel(x, y, lut[state.buf[y * W + x]!]!);
    }
  }
}

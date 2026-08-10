import type { RGBA } from "../color";
import { h2rgb, hsvToRgb, rgba, rgbToHsv } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32, hashRandom01 } from "../rng";

export type MeteorsColorScheme = "rainbow" | "range" | "palette";

export interface MeteorsParams {
  colors: MeteorsColorScheme;
  count: number; // 1-100, spawn density %
  trailLength: number; // 1-100
  speed: number; // 0-50
}

interface Meteor {
  col: number;
  pos: number;
  n: number; // per-meteor phase seed for rainbow hue hashing
  color: RGBA; // resolved at spawn for range/palette schemes
}

export interface MeteorsState {
  meteors: Meteor[];
  rng: () => number;
  seed: number;
  nextN: number;
}

export function createMeteorsState(seed: number): MeteorsState {
  return { meteors: [], rng: mulberry32(seed), seed, nextN: 0 };
}

// SPEC ch7 "Meteors", Effect=Down only (Up/Left/Right/Implode/Explode/Icicles are a
// documented ceiling). Frame-time-based speed accumulator simplified to "cells/frame"
// (no frameTimeMs in FrameContext yet) - still deterministic per seed.
export function renderMeteors(buffer: RenderBuffer, palette: RGBA[], params: MeteorsParams, state: MeteorsState): void {
  const { width: W, height: H } = buffer;
  const dim = H;
  const trailLength = Math.max(1, dim < 10 ? Math.round(params.trailLength / 10) : Math.round((dim * params.trailLength) / 100));
  const speed = Math.max(1, params.speed / 5);

  // SPAWN
  for (let col = 0; col < W; col++) {
    if (state.rng() * 200 < params.count) {
      let color: RGBA = rgba(255, 255, 255, 255);
      if (params.colors === "range" && palette.length >= 2) {
        const t = state.rng();
        const h1 = rgbToHsv(palette[0]!);
        const h2 = rgbToHsv(palette[1]!);
        color = hsvToRgb(h1.h + (h2.h - h1.h) * t, 1, 1);
      } else if (params.colors === "palette" && palette.length > 0) {
        color = palette[Math.floor(state.rng() * palette.length)]!;
      }
      state.meteors.push({ col, pos: H - 1, n: state.nextN++, color });
    }
  }

  // MOVE
  for (const m of state.meteors) m.pos -= speed;

  // KILL
  state.meteors = state.meteors.filter((m) => m.pos + trailLength >= 0);

  // DRAW (later meteors in the list overwrite earlier ones on a shared column, matching
  // "last meteor wins" serial-order semantics)
  for (const m of state.meteors) {
    for (let ph = 0; ph <= trailLength; ph++) {
      const y = Math.round(m.pos + ph);
      if (y < 0 || y >= H) continue;
      const fade = 1 - ph / trailLength;
      let color: RGBA;
      if (params.colors === "rainbow") {
        color = h2rgb(hashRandom01(state.seed, m.n * 131101 + ph));
      } else {
        color = m.color;
      }
      buffer.setPixel(m.col, y, { ...color, a: Math.round(255 * fade) });
    }
  }
}

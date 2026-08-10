import type { RGBA } from "../color";
import { twoColorBlend } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface ShockwaveParams {
  centerXPct: number; // 0-100
  centerYPct: number; // 0-100
  startRadius: number; // 0-750, % of buffer (Scale to Buffer = always on)
  endRadius: number;
  startWidth: number; // 0-255, % of buffer
  endWidth: number;
  cycles: number;
  blendEdges: boolean;
}

// SPEC ch8 "Shockwave". Acceleration curve (Accel != 0) and timing-track-fired mode are a
// documented ceiling - Scale to Buffer is always on (the more common setting).
export function renderShockwave(buffer: RenderBuffer, palette: RGBA[], params: ShockwaveParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const position = effectTimeIntervalPosition(ctx.positionInEffect01, params.cycles);
  const xc = (params.centerXPct * W) / 100;
  const yc = (params.centerYPct * H) / 100;

  const dim = Math.max(W, H);
  const r1 = (params.startRadius * dim) / 200;
  const r2 = (params.endRadius * dim) / 200;
  const w1 = (params.startWidth * dim) / 100;
  const w2 = (params.endWidth * dim) / 100;

  const radiusCenter = r1 + (r2 - r1) * position;
  const halfWidth = Math.max(0.25, (w1 + (w2 - w1) * position) / 2);

  const colorcnt = Math.max(1, palette.length);
  const scaled = colorcnt > 1 ? position * (colorcnt - 1) : 0;
  const idx = Math.min(colorcnt - 1, Math.floor(scaled));
  const frac = scaled - idx;
  const color: RGBA = colorcnt > 1 ? twoColorBlend(palette, idx, Math.min(colorcnt - 1, idx + 1), frac) : palette[0] ?? { r: 255, g: 255, b: 255, a: 255 };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - xc, y - yc);
      if (Math.abs(r - radiusCenter) > halfWidth) continue;
      if (params.blendEdges) {
        const pct = 1 - Math.abs(r - radiusCenter) / halfWidth;
        buffer.setPixel(x, y, { ...color, a: Math.round(255 * pct) });
      } else {
        buffer.setPixel(x, y, color);
      }
    }
  }
}

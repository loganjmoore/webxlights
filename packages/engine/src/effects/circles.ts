import type { RGBA } from "../color";
import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { hashRandom01 } from "../rng";
import type { FrameContext } from "./types";

export interface CirclesParams {
  count: number; // 1-50
  size: number; // radius in pixels
  movement: "bounce" | "radial" | "explode" | "none";
  speed: number; // 0-50
  fade: boolean; // radial falloff instead of a hard disc
  bubbles: boolean; // draw outlines instead of filled discs
}

// SPEC ch8 "Circles": N coloured circles moving inside the buffer. xLights carries circle
// positions frame to frame; here each circle's path is a closed-form function of time, seed and
// index, so the effect is stateless (no replay-from-start cost when scrubbing) while still
// being deterministic - the reflect() below is exactly what integrating a constant velocity
// with wall bounces produces, just evaluated directly instead of stepped.
export function renderCircles(buffer: RenderBuffer, palette: RGBA[], params: CirclesParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const count = Math.max(1, Math.round(params.count));
  const radius = Math.max(0.5, params.size);
  const t = ctx.positionInEffect01 * Math.max(0, params.speed) * 20;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;

  for (let i = 0; i < count; i++) {
    const color = palette[i % Math.max(1, palette.length)] ?? rgba(255, 255, 255, 255);
    const x0 = hashRandom01(ctx.seed, i * 4 + 1) * Math.max(1, W - 1);
    const y0 = hashRandom01(ctx.seed, i * 4 + 2) * Math.max(1, H - 1);

    let cxi: number;
    let cyi: number;
    let scale = 1;

    if (params.movement === "none") {
      cxi = x0;
      cyi = y0;
    } else if (params.movement === "radial") {
      // orbit the buffer centre, each circle on its own radius and phase
      const angle = 2 * Math.PI * (hashRandom01(ctx.seed, i * 4 + 3) + t / 100);
      const orbit = (0.2 + 0.8 * hashRandom01(ctx.seed, i * 4 + 4)) * Math.min(cx, cy);
      cxi = cx + Math.cos(angle) * orbit;
      cyi = cy + Math.sin(angle) * orbit;
    } else if (params.movement === "explode") {
      // fly outward from the centre and shrink, restarting each pass
      const phase = (t / 100 + hashRandom01(ctx.seed, i * 4 + 3)) % 1;
      const angle = 2 * Math.PI * hashRandom01(ctx.seed, i * 4 + 4);
      const reach = Math.hypot(cx, cy);
      cxi = cx + Math.cos(angle) * reach * phase;
      cyi = cy + Math.sin(angle) * reach * phase;
      scale = 1 - phase;
    } else {
      const vx = (hashRandom01(ctx.seed, i * 4 + 3) - 0.5) * 2;
      const vy = (hashRandom01(ctx.seed, i * 4 + 4) - 0.5) * 2;
      cxi = reflect(x0 + vx * t, W - 1);
      cyi = reflect(y0 + vy * t, H - 1);
    }

    drawCircle(buffer, cxi, cyi, radius * scale, color, params);
  }
}

// Fold an unbounded coordinate back into [0, span] the way a perfectly elastic bounce would.
export function reflect(p: number, span: number): number {
  if (span <= 0) return 0;
  const period = 2 * span;
  const q = ((p % period) + period) % period;
  return q <= span ? q : period - q;
}

function drawCircle(buffer: RenderBuffer, cx: number, cy: number, radius: number, color: RGBA, params: CirclesParams): void {
  if (radius <= 0) return;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(buffer.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(buffer.height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      if (params.bubbles && d < radius - 1) continue; // outline only
      const alpha = params.fade && !params.bubbles ? Math.round(color.a * (1 - d / radius)) : color.a;
      if (alpha <= 0) continue;
      buffer.setPixel(x, y, { ...color, a: alpha });
    }
  }
}

import type { RGBA } from "../color";
import { multiColorBlend } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface GalaxyParams {
  centerXPct: number; // 0-100
  centerYPct: number; // 0-100
  startRadius: number;
  endRadius: number;
  startAngleDeg: number;
  revolutionsDeg: number; // total sweep, e.g. 1440 = 4 turns
  startWidth: number;
  endWidth: number;
  durationPct: number; // % of the effect the arm takes to draw itself
  reverse: boolean;
  blendEdges: boolean;
  inward: boolean;
}

// SPEC ch8 "Galaxy": a spiral arm swept out from a centre point. Radius and width interpolate
// from start to end along the arm, colour walks the palette along its length, and the head
// advances with time until the arm is fully drawn at `durationPct` through the effect.
export function renderGalaxy(buffer: RenderBuffer, palette: RGBA[], params: GalaxyParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const cx = (params.centerXPct / 100) * (W - 1);
  const cy = (params.centerYPct / 100) * (H - 1);
  const revolutions = Math.max(1, params.revolutionsDeg);
  const duration01 = Math.max(0.01, params.durationPct / 100);
  const headT = Math.min(1, ctx.positionInEffect01 / duration01);
  const direction = params.reverse ? -1 : 1;

  // one sample per degree keeps the arm continuous at any buffer size we render into
  const steps = Math.ceil(revolutions);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (t > headT) break;

    const angleDeg = params.startAngleDeg + direction * revolutions * t;
    const angle = (angleDeg * Math.PI) / 180;
    const radiusT = params.inward ? 1 - t : t;
    const radius = params.startRadius + (params.endRadius - params.startRadius) * radiusT;
    const width = Math.max(0.5, params.startWidth + (params.endWidth - params.startWidth) * t);
    const color = multiColorBlend(palette, t, true);

    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    stampDisc(buffer, px, py, width / 2, color, params.blendEdges);
  }
}

function stampDisc(buffer: RenderBuffer, cx: number, cy: number, radius: number, color: RGBA, blendEdges: boolean): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(buffer.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(buffer.height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      const alpha = blendEdges && radius > 0 ? Math.round(color.a * (1 - d / radius)) : color.a;
      if (alpha <= 0) continue;
      const existing = buffer.getPixel(x, y);
      // the arm overlaps itself on tight spirals - keep the brighter sample
      if (existing.a > alpha) continue;
      buffer.setPixel(x, y, { ...color, a: alpha });
    }
  }
}

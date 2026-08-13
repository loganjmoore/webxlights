import type { RGBA } from "../color";
import { multiColorBlend } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface FanParams {
  centerXPct: number; // 0-100
  centerYPct: number; // 0-100
  startRadiusPct: number; // 0-100 of the buffer's half-diagonal
  endRadiusPct: number; // 0-100
  startAngleDeg: number;
  revolutionsDeg: number; // total rotation across the effect
  bladeCount: number; // 1-10
  bladeWidthDeg: number; // 1-360 angular width of one blade
  bladeAngleDeg: number; // skew: how far a blade's tip lags its root
  elementCount: number; // 1-8 concentric elements per blade
  elementWidthPct: number; // 0-100 of each element's radial slot
  reverse: boolean;
  blendEdges: boolean;
}

// SPEC ch8 "Fan": blades sweeping around a centre. Each blade is an angular wedge between a
// start and end radius; Blade Angle skews the wedge so the tip trails the root (the classic
// curved-fan look), and Num Elements splits each blade into concentric arcs.
export function renderFan(buffer: RenderBuffer, palette: RGBA[], params: FanParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const cx = (params.centerXPct / 100) * (W - 1);
  const cy = (params.centerYPct / 100) * (H - 1);
  const maxRadius = Math.hypot(Math.max(cx, W - 1 - cx), Math.max(cy, H - 1 - cy));
  const rStart = (params.startRadiusPct / 100) * maxRadius;
  const rEnd = (params.endRadiusPct / 100) * maxRadius;
  const rInner = Math.min(rStart, rEnd);
  const rOuter = Math.max(rStart, rEnd);
  if (rOuter <= 0) return;

  const direction = params.reverse ? -1 : 1;
  const rotation = params.startAngleDeg + direction * params.revolutionsDeg * ctx.positionInEffect01;
  const bladeCount = Math.max(1, Math.round(params.bladeCount));
  const bladeWidth = Math.max(1, params.bladeWidthDeg);
  const elements = Math.max(1, Math.round(params.elementCount));
  const elementFill = Math.max(0, Math.min(1, params.elementWidthPct / 100));
  const bladeSpacing = 360 / bladeCount;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r < rInner || r > rOuter) continue;

      const radialT = rOuter > rInner ? (r - rInner) / (rOuter - rInner) : 0;

      // element banding: each blade is cut into `elements` concentric arcs
      const slot = radialT * elements;
      if (slot - Math.floor(slot) > elementFill) continue;

      // skew grows with radius, so the blade curves rather than staying a straight wedge
      const skew = params.bladeAngleDeg * radialT;
      const angleDeg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI - rotation - skew);
      const withinBlade = angleDeg % bladeSpacing;
      if (withinBlade > bladeWidth) continue;

      const bladeIndex = Math.floor(angleDeg / bladeSpacing) % bladeCount;
      const color = multiColorBlend(palette, bladeCount > 1 ? bladeIndex / bladeCount : radialT, true);
      const alpha = params.blendEdges ? Math.round(color.a * (1 - withinBlade / bladeWidth)) : color.a;
      if (alpha <= 0) continue;
      buffer.setPixel(x, y, { ...color, a: alpha });
    }
  }
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

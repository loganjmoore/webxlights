import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface GarlandsParams {
  type: number; // 0-4, droop pattern depth
  spacing: number; // 1-100, % of buffer height between garlands
  speed: number; // 0-50, how fast the stack fills
  fillPct: number; // 0-100, how much of the buffer ends up covered
}

// SPEC ch8 "Garlands": rows of lights drop in from above the buffer and stack up from the
// bottom, each row sagging in a repeating pattern chosen by Type. The five droop patterns are
// the same shallow-to-deep progression xLights uses (flat, alternating, then 3/4/5-deep saw
// shapes); the columns repeat every 2/4/6/8 pixels respectively.
const DROOP_PATTERNS: number[][] = [[0], [0, 1], [0, 1, 2, 1], [0, 1, 2, 3, 2, 1], [0, 1, 2, 3, 4, 3, 2, 1]];

export function garlandDroop(type: number, x: number): number {
  const pattern = DROOP_PATTERNS[Math.max(0, Math.min(DROOP_PATTERNS.length - 1, Math.round(type)))]!;
  return pattern[((x % pattern.length) + pattern.length) % pattern.length]!;
}

export function renderGarlands(buffer: RenderBuffer, palette: RGBA[], params: GarlandsParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const rowSpacing = Math.max(2, Math.round((Math.max(1, params.spacing) / 100) * H));
  const covered = Math.max(1, Math.round((Math.max(0, params.fillPct) / 100) * H));
  const ringCount = Math.max(1, Math.floor(covered / rowSpacing));

  // The whole stack fills across the effect; Speed scales how much of the effect that takes.
  const fillProgress = Math.min(1, ctx.positionInEffect01 * (1 + params.speed / 10));

  for (let g = 0; g < ringCount; g++) {
    // Each garland starts falling only once the ones below it have landed.
    const own = Math.max(0, Math.min(1, fillProgress * ringCount - g));
    if (own <= 0) continue;

    const restY = g * rowSpacing;
    const startY = H + DROOP_PATTERNS[DROOP_PATTERNS.length - 1]!.length;
    const baseY = startY + (restY - startY) * own;
    const color = palette[g % Math.max(1, palette.length)] ?? { r: 255, g: 255, b: 255, a: 255 };

    for (let x = 0; x < W; x++) {
      const y = Math.round(baseY - garlandDroop(params.type, x));
      if (y < 0 || y >= H) continue;
      buffer.setPixel(x, y, color);
    }
  }
}

import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface SingleStrandChaseParams {
  chaseSizePct: number; // 1-100, % of strand
  cycles: number;
  offsetPct: number; // -500..500
}

// SPEC ch8 "SingleStrand" Chase tab: single chase (Number_Chases=1), Left-Right direction,
// Palette color scheme, Fade=None, no timing track / mirror / dual / static / group-all.
// The Skips and FX tabs are an entirely separate documented ceiling.
export function renderSingleStrandChase(buffer: RenderBuffer, palette: RGBA[], params: SingleStrandChaseParams, ctx: FrameContext): void {
  const width = buffer.width;
  const colorcnt = Math.max(1, palette.length);
  const basePos = effectTimeIntervalPosition(ctx.positionInEffect01, params.cycles);
  const rtval = ((basePos + params.offsetPct / 100) % 1 + 1) % 1;

  const scw = Math.max(1, Math.round((width * params.chaseSizePct) / 100));
  const startState = (width + scw - 1) * rtval + 1;
  const x0 = startState - scw;

  const count = Math.min(scw, width);
  for (let i = 0; i < count; i++) {
    const colorIdx = Math.max(0, Math.ceil(((scw - i) * colorcnt) / scw) - 1) % colorcnt;
    const color: RGBA = palette[colorIdx]!;
    let newX = Math.round(x0 + i) % width;
    if (newX < 0) newX += width;
    for (let y = 0; y < buffer.height; y++) buffer.setPixel(newX, y, color);
  }
}

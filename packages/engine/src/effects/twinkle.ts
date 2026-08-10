import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export interface TwinkleParams {
  countPct: number; // 2-100, % of lights active simultaneously
  steps: number; // 2-400, frames per full up/down cycle
}

// SPEC ch8 "Twinkle", Old Render Method, no Re-Randomize, no Strobe (New Render Method's
// dynamic re-placement and Strobe's single-frame flash are a documented ceiling). Old is
// a pure function of frame index given the seed, so no external state is needed: duration
// at any frame = (initDuration + frameIndexInEffect) % max_modulo (the "repeat same ramp"
// behavior when Re-Randomize is off).
export function renderTwinkle(buffer: RenderBuffer, palette: RGBA[], params: TwinkleParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const strobeCount = W * H;
  const lights = Math.max(1, Math.round((strobeCount * params.countPct) / 100));
  const step = strobeCount / lights;
  const maxModulo = Math.max(2, params.steps);
  const maxModulo2 = maxModulo / 2;
  const rng = mulberry32(ctx.seed);

  for (let i = 0; i < lights; i++) {
    const cellIndex = Math.floor(i * step) % strobeCount;
    const x = cellIndex % W;
    const y = Math.floor(cellIndex / W);
    const durationInit = Math.floor(rng() * maxModulo);
    const colorIdx = palette.length > 0 ? Math.floor(rng() * palette.length) : 0;

    const duration = (durationInit + ctx.frameIndexInEffect) % maxModulo;
    const v = duration <= maxModulo2 ? duration / maxModulo2 : (maxModulo - duration) / maxModulo2;
    const base = palette[colorIdx] ?? rgba(255, 255, 255, 255);
    buffer.setPixel(x, y, { ...base, a: Math.round(255 * v) });
  }
}

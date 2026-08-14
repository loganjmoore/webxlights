import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface ShimmerParams {
  dutyFactor: number; // 1-100, % of each cycle the lights are on
  cycleCount: number; // cycles across the effect's duration
  useAllColors: boolean;
}

// Manual "Shimmer": the lights rapidly turn on and off. Duty Factor is the share of each cycle
// they are on for; Cycle Count is how many on/off cycles fit in the effect.
//
// Use All Colors changes what the effect *is*, per the manual: "generates a pulse rather than a
// shimmer with the selected colors pulsing off and on in sequence". So it isn't a colour-picking
// tweak - off it flashes the first colour, on it steps through the palette one colour per cycle.
export function renderShimmer(buffer: RenderBuffer, palette: RGBA[], params: ShimmerParams, ctx: FrameContext): void {
  const cycles = Math.max(1, params.cycleCount);
  const duty = Math.min(100, Math.max(1, params.dutyFactor)) / 100;

  // Position through the whole effect, so the cycle count is per-effect rather than per-second -
  // the manual measures it "in the timeframe of the effect".
  const cyclePos = (ctx.positionInEffect01 * cycles) % 1;
  const on = cyclePos < duty;
  if (!on) return; // the off half of the cycle leaves the buffer transparent

  const cycleIndex = Math.floor(ctx.positionInEffect01 * cycles);
  const color = params.useAllColors
    ? (palette[cycleIndex % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255))
    : (palette[0] ?? rgba(255, 255, 255, 255));

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) buffer.setPixel(x, y, color);
  }
}

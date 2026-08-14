import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export type FillDirection = "up" | "down" | "left" | "right";

export interface FillParams {
  position: number; // 0-100, how far the fill has reached
  bandSize: number; // % of the run that lights
  skipSize: number; // % of the run that stays dark between bands
  offset: number; // % shift of the band pattern
  changeColorOverTime: boolean;
  direction: FillDirection;
}

// Manual "Fill": starts from one edge and fills to the position value. Band Size and Skip Size
// cut that fill into stripes - a band of lit pixels, then a skipped dark run, repeating.
//
// The direction names describe where the fill *starts*, and the manual is explicit that Left
// "starts at right and moves left" - the opposite of what the word suggests on its own, which is
// exactly the kind of thing worth pinning down rather than guessing.
export function renderFill(buffer: RenderBuffer, palette: RGBA[], params: FillParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const vertical = params.direction === "up" || params.direction === "down";
  const span = vertical ? H : W;
  if (span <= 0) return;

  const reach = (Math.min(100, Math.max(0, params.position)) / 100) * span;
  const band = Math.max(0, params.bandSize);
  const skip = Math.max(0, params.skipSize);
  const period = band + skip;
  const offsetPx = (params.offset / 100) * span;

  // "Select multiple colors to fade (equally) between those colors for the duration of the
  // effect" - so with the option on the whole fill is one colour that walks the palette, rather
  // than the palette being spread along the fill.
  const color = pickColor(palette, params.changeColorOverTime ? ctx.positionInEffect01 : 0);

  for (let i = 0; i < span; i++) {
    // Distance from the edge the fill grows out of.
    const fromStart = params.direction === "up" || params.direction === "right" ? i : span - 1 - i;
    if (fromStart >= reach) continue;
    if (period > 0) {
      const phase = (((fromStart + offsetPx) % period) + period) % period;
      if (phase >= band) continue; // in the skipped run
    }
    if (vertical) {
      for (let x = 0; x < W; x++) buffer.setPixel(x, i, color);
    } else {
      for (let y = 0; y < H; y++) buffer.setPixel(i, y, color);
    }
  }
}

function pickColor(palette: RGBA[], t: number): RGBA {
  if (palette.length === 0) return rgba(255, 255, 255, 255);
  if (palette.length === 1) return palette[0]!;
  const scaled = Math.min(0.999999, Math.max(0, t)) * palette.length;
  return palette[Math.floor(scaled)] ?? palette[0]!;
}

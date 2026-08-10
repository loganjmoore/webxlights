import type { RGBA } from "../color";
import { multiColorBlend, rgbToHsv, hsvToRgb } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface ColorWashParams {
  cycles: number;
  verticalFade: boolean;
  horizontalFade: boolean;
  reverseFades: boolean;
  shimmer: boolean;
  circularPalette: boolean;
}

export function renderColorWash(buffer: RenderBuffer, palette: RGBA[], params: ColorWashParams, ctx: FrameContext): void {
  if (params.shimmer && ctx.frameIndexInEffect % 2 !== 0) {
    buffer.fill({ r: 0, g: 0, b: 0, a: 0 });
    return;
  }

  const position = effectTimeIntervalPosition(ctx.positionInEffect01, params.cycles);
  const color = multiColorBlend(palette, position, params.circularPalette);
  const { width: W, height: H } = buffer;
  const halfW = (W - 1) / 2 || 1;
  const halfH = (H - 1) / 2 || 1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let multH = 1;
      let multV = 1;
      if (params.horizontalFade) {
        const t = Math.abs(x - halfW) / halfW;
        multH = params.reverseFades ? t : 1 - t;
        multH = Math.max(0, Math.min(1, multH));
      }
      if (params.verticalFade) {
        const t = Math.abs(y - halfH) / halfH;
        multV = params.reverseFades ? t : 1 - t;
        multV = Math.max(0, Math.min(1, multV));
      }
      if (multH === 1 && multV === 1) {
        buffer.setPixel(x, y, color);
      } else {
        const hsv = rgbToHsv(color);
        buffer.setPixel(x, y, hsvToRgb(hsv.h, hsv.s, hsv.v * multH * multV, color.a));
      }
    }
  }
}

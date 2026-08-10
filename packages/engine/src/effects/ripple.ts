import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface RippleParams {
  movement: "explode" | "implode";
  cycles: number;
  thickness: number; // 1-100
}

// SPEC ch8 "Ripple", legacy "Old" draw style + Circle object only (the 18 other draw-style x
// object combinations - Lines/Solid/Highlight x Square/Triangle/Star/etc/SVG - are the largest
// documented ceiling in M6; Old+Circle is the default and most common case).
export function renderRipple(buffer: RenderBuffer, palette: RGBA[], params: RippleParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const xc = W / 2;
  const yc = H / 2;
  const maxRadius = Math.max(W, H) / 2;
  const position = effectTimeIntervalPosition(ctx.positionInEffect01, params.cycles);
  const radius = params.movement === "explode" ? maxRadius * position : maxRadius * (1 - position);

  const colorcnt = Math.max(1, palette.length);
  const colorIdx = Math.min(colorcnt - 1, Math.floor(position * colorcnt));
  const color: RGBA = palette[colorIdx] ?? { r: 255, g: 255, b: 255, a: 255 };
  const sign = params.movement === "explode" ? 1 : -1;

  for (let i = 0; i < params.thickness; i += 0.5) {
    const ringRadius = radius + sign * i;
    if (ringRadius <= 0) continue;
    for (let deg = 0; deg < 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      const x = Math.round(xc + ringRadius * Math.cos(rad));
      const y = Math.round(yc + ringRadius * Math.sin(rad));
      buffer.setPixel(x, y, color);
    }
  }
}

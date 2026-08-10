import { h2rgb, multiColorBlend, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface ButterflyParams {
  colors: "rainbow" | "palette";
  chunks: number; // 1-10
  skip: number; // 2-10
  speed: number; // 0-100
  reverse: boolean;
}

// SPEC ch7 "Butterfly", Style 1 only (the classic pattern; styles 2-5 integer-math variants
// and 6-10 plasma variants are a documented ceiling). frameTimeMs-based curState simplified
// to frameIndexInEffect * speed (no frameTimeMs in FrameContext yet).
export function renderButterfly(buffer: RenderBuffer, palette: RGBA[], params: ButterflyParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const curState = ctx.frameIndexInEffect * params.speed;
  const offset = (params.reverse ? -curState : curState) / 200;
  const sz = W + H;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = Math.abs((x * x - y * y) * Math.sin(offset + ((x + y) * 2 * Math.PI) / sz));
      const d = x * x + y * y;
      const h = d > 0.001 ? Math.max(0, Math.min(1, n / d)) : 0;

      if (params.chunks > 1 && Math.floor(h * params.chunks) % params.skip === 0) continue;

      const color = params.colors === "rainbow" ? h2rgb(h) : multiColorBlend(palette, h, false);
      buffer.setPixel(x, y, color);
    }
  }
}

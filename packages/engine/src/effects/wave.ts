import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface WaveParams {
  numberOfWavesDeg: number; // 180-3600 (degrees; 900 = 2.5 waves across the width)
  thicknessPct: number; // 0-100
  heightPct: number; // 0-100
  speed: number; // 0-50
  leftToRight: boolean;
}

// SPEC ch8 "Wave", Sine type only, Fill Colors=None, no Mirror (Triangle/Square/Fractal wave
// types and Rainbow/Palette fills are a documented ceiling).
export function renderWave(buffer: RenderBuffer, palette: RGBA[], params: WaveParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const state = ctx.frameIndexInEffect * params.speed;
  const degreePerX = params.numberOfWavesDeg / W;
  const yc = H / 2;
  const r = H / 2;
  const color: RGBA = palette[0] ?? { r: 255, g: 255, b: 255, a: 255 };

  for (let x = 0; x < W; x++) {
    const degree = x * degreePerX + (params.leftToRight ? -state : state);
    const rad = (degree * Math.PI) / 180;
    const ystart = r * (params.heightPct / 100) * Math.sin(rad) + yc;

    const halfThickness = Math.max(0.5, (r * params.thicknessPct) / 100);
    const y1 = Math.round(ystart - halfThickness);
    const y2 = Math.round(ystart + halfThickness);
    for (let y = y1; y <= y2; y++) buffer.setPixel(x, y, color);
  }
}

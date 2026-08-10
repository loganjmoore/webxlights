import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface PinwheelParams {
  arms: number; // 1-20
  armSizePct: number; // 0-400
  thicknessPct: number; // 0-100
  speed: number; // 0-50
  counterClockwise: boolean;
}

// SPEC ch8 "Pinwheel", New Render Method core per-pixel formula. Twist, 3D/3D-Inverted/Sweep
// shading, and the narrow-buffer CPU pre-pass line are a documented ceiling.
export function renderPinwheel(buffer: RenderBuffer, palette: RGBA[], params: PinwheelParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const colorcnt = Math.max(1, palette.length);
  const pos = ctx.frameIndexInEffect * params.speed;
  const degreesPerArm = 360 / params.arms;
  const maxRadius = (Math.hypot(W, H) / 2) * (params.armSizePct / 100);
  const tmax = Math.max(1, (params.thicknessPct / 100) * degreesPerArm);
  const xc = W / 2;
  const yc = H / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x1 = x - xc;
      const y1 = y - yc;
      const r = Math.hypot(x1, y1);
      if (r <= 0 || r > maxRadius) continue;

      let theta = (Math.atan2(x1, y1) * 180) / Math.PI;
      theta = params.counterClockwise ? pos + theta : pos - theta;
      theta += tmax / 2 + 540;

      const t2 = ((theta % degreesPerArm) + degreesPerArm) % degreesPerArm;
      if (t2 > tmax) continue;

      const colorIdx = Math.floor(theta / degreesPerArm) % colorcnt;
      const color: RGBA = palette[((colorIdx % colorcnt) + colorcnt) % colorcnt] ?? { r: 255, g: 255, b: 255, a: 255 };
      buffer.setPixel(x, y, color);
    }
  }
}

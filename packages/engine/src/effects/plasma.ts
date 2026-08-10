import type { RGBA } from "../color";
import { h2rgb, multiColorBlend } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface PlasmaParams {
  style: number; // 1-4
  lineDensity: number; // 1-10
  speed: number; // 0-50
  colors: "palette" | "rainbow";
}

// SPEC ch8 "Plasma": the classic summed-sine plasma field. Four styles vary which sine terms
// are summed (axis-aligned, radial, rotating, and a moving-centre variant); the summed field is
// mapped through the palette. Everything is a closed-form function of (x, y, time), so it is
// stateless and identical on every replay.
export function renderPlasma(buffer: RenderBuffer, palette: RGBA[], params: PlasmaParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const density = Math.max(1, params.lineDensity);
  // Speed is radians of phase advance across the whole effect. Deliberately *not* scaled by
  // 2*PI: at whole-number speeds that lands every sine term on an exact period boundary at
  // simple positions (0.5, 1.0, ...), so the "animated" field would repeat itself exactly.
  const time = ctx.positionInEffect01 * Math.max(0, params.speed);
  const style = Math.max(1, Math.min(4, Math.round(params.style)));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // normalise to roughly -1..1 so density reads the same on any buffer size
      const nx = W > 1 ? (x / (W - 1)) * 2 - 1 : 0;
      const ny = H > 1 ? (y / (H - 1)) * 2 - 1 : 0;
      const v = plasmaField(style, nx * density, ny * density, time);

      // field is in [-terms, +terms]; fold it into 0..1
      const t = 0.5 + 0.5 * Math.sin(v * Math.PI);
      const color = params.colors === "rainbow" ? h2rgb(t) : multiColorBlend(palette, t, true);
      buffer.setPixel(x, y, color);
    }
  }
}

function plasmaField(style: number, x: number, y: number, t: number): number {
  switch (style) {
    case 1:
      return (Math.sin(x + t) + Math.sin(y + t) + Math.sin((x + y) / 2 + t)) / 3;
    case 2: {
      const r = Math.hypot(x, y);
      return (Math.sin(x + t) + Math.sin(y - t) + Math.sin(r * 2 + t)) / 3;
    }
    case 3: {
      // rotating axes: the whole pattern turns as `t` advances
      const rx = x * Math.cos(t / 4) - y * Math.sin(t / 4);
      const ry = x * Math.sin(t / 4) + y * Math.cos(t / 4);
      return (Math.sin(rx) + Math.sin(ry / 1.5) + Math.sin((rx + ry) / 2 + t)) / 3;
    }
    case 4:
    default: {
      // moving centre: the radial term orbits instead of sitting at the origin
      const cx = Math.cos(t / 3) * 0.6;
      const cy = Math.sin(t / 2) * 0.6;
      const r = Math.hypot(x - cx * 3, y - cy * 3);
      return (Math.sin(r * 2 + t) + Math.sin(x + t / 2) + Math.sin(y - t / 2)) / 3;
    }
  }
}

import { multiColorBlend, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export interface SpiralsParams {
  paletteRep: number; // 1-5
  spiralWraps: number; // -30..30 ("Rotation")
  thicknessPct: number; // 0-100
  movement: number; // -20..20
  blend: boolean;
}

// SPEC ch8 "Spirals" - core arm/thickness/rotation math faithful; 3D shading and Grow/Shrink
// thickness-state modulation are a documented ceiling.
export function renderSpirals(buffer: RenderBuffer, palette: RGBA[], params: SpiralsParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const colorcnt = Math.max(1, palette.length);
  const spiralCount = Math.max(1, colorcnt * params.paletteRep);
  const deltaStrands = W / spiralCount;
  const spiralThickness = Math.max(1, deltaStrands * (params.thicknessPct / 100) + 1);

  const direction = Math.sign(params.movement) || 1;
  const position = effectTimeIntervalPosition(ctx.positionInEffect01, Math.abs(params.movement) || 1);
  const spiralState = position * W * 10 * direction;

  for (let ns = 0; ns < spiralCount; ns++) {
    const color = palette[ns % colorcnt]!;
    const strandBase = ns * deltaStrands;
    for (let thick = 0; thick < spiralThickness; thick++) {
      for (let y = 0; y < H; y++) {
        const xf = strandBase + thick + spiralState / 10 + (y * params.spiralWraps) / H;
        let x = Math.round(xf) % W;
        if (x < 0) x += W;
        const pixelColor = params.blend ? multiColorBlend(palette, (H - y - 1) / H, false) : color;
        buffer.setPixel(x, y, pixelColor);
      }
    }
  }
}

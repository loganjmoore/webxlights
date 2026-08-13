import type { RGBA } from "../color";
import { lerpColor } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export type CurtainEdge = "left" | "right" | "center" | "top" | "bottom";
export type CurtainMovement = "open" | "close" | "open then close" | "close then open";

export interface CurtainParams {
  edge: CurtainEdge;
  movement: CurtainMovement;
  swagPct: number; // 0-100, how far the leading edge sags
  repeat: number; // 1-10 open/close cycles across the effect
  speed: number; // 0-50, ripple speed of the swag
}

// SPEC ch8 "Curtain": one or two fabric panels drawn over the buffer, opening or closing across
// the effect. Fabric is drawn as vertical stripes blending through the palette (so it reads as
// folds rather than a flat block), and the leading edge carries a sinusoidal "swag".
export function renderCurtain(buffer: RenderBuffer, palette: RGBA[], params: CurtainParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  // The sawtooth wraps to 0 at the very end of the effect, which would snap a curtain that has
  // just finished opening back to fully closed on its last frame. Hold the final cycle at 1.
  const repeat = Math.max(1, params.repeat);
  const scaled = ctx.positionInEffect01 * repeat;
  const cyclePos = scaled >= repeat ? 1 : effectTimeIntervalPosition(ctx.positionInEffect01, repeat);
  const openness = opennessFor(params.movement, cyclePos); // 0 = fully closed, 1 = fully open

  const vertical = params.edge === "top" || params.edge === "bottom";
  const along = vertical ? H : W; // axis the curtain travels along
  const across = vertical ? W : H; // axis the swag varies over

  for (let a = 0; a < across; a++) {
    const swag = swagOffset(params, a, across, ctx);
    const cover = (1 - openness) * along + swag;

    for (let p = 0; p < along; p++) {
      let covered: boolean;
      switch (params.edge) {
        case "left":
        case "bottom":
          covered = p < cover;
          break;
        case "right":
        case "top":
          covered = p >= along - cover;
          break;
        case "center":
        default:
          covered = p < cover / 2 || p >= along - cover / 2;
          break;
      }
      if (!covered) continue;

      const x = vertical ? a : p;
      const y = vertical ? p : a;
      buffer.setPixel(x, y, fabricColor(palette, p, along));
    }
  }
}

function opennessFor(movement: CurtainMovement, pos: number): number {
  switch (movement) {
    case "open":
      return pos;
    case "close":
      return 1 - pos;
    case "open then close":
      return pos <= 0.5 ? pos * 2 : (1 - pos) * 2;
    case "close then open":
    default:
      return pos <= 0.5 ? 1 - pos * 2 : (pos - 0.5) * 2;
  }
}

// The leading edge sags in a half-sine across the curtain, drifting with Speed so the fold
// moves instead of sitting still.
function swagOffset(params: CurtainParams, a: number, across: number, ctx: FrameContext): number {
  if (params.swagPct <= 0 || across <= 1) return 0;
  const amplitude = (params.swagPct / 100) * (across / 4);
  const drift = ctx.positionInEffect01 * params.speed;
  return amplitude * Math.sin(Math.PI * (a / (across - 1)) + drift);
}

// Fold shading: stripes stepping through the palette along the travel axis.
function fabricColor(palette: RGBA[], p: number, along: number): RGBA {
  const white: RGBA = { r: 255, g: 255, b: 255, a: 255 };
  if (palette.length === 0) return white;
  if (palette.length === 1) return palette[0]!;
  const stripes = Math.max(2, Math.round(along / 6));
  const t = ((p % stripes) / stripes) * (palette.length - 1);
  const idx = Math.min(palette.length - 2, Math.floor(t));
  return lerpColor(palette[idx]!, palette[idx + 1]!, t - idx);
}

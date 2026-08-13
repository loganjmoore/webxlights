import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface MarqueeParams {
  bandCount: number; // 1-10 palette bands chasing round the ring
  bandSize: number; // pixels of colour per band
  skipSize: number; // pixels of gap between bands
  thickness: number; // 1-10 rings drawn inward from the edge
  stagger: number; // per-ring offset, so inner rings trail the outer ones
  speed: number; // 0-50 chase speed
  reverse: boolean;
}

// SPEC ch8 "Marquee": theatre-sign chase running around the buffer's border. Pixels are grouped
// into concentric rectangular rings (ring 0 = the outer edge); each ring's pixels are ordered
// around its perimeter, and colour bands of `bandSize` separated by `skipSize` chase along that
// ordering. `stagger` offsets each ring so the rings don't move in lockstep.
export function renderMarquee(buffer: RenderBuffer, palette: RGBA[], params: MarqueeParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const thickness = Math.max(1, Math.round(params.thickness));
  const bandSize = Math.max(1, Math.round(params.bandSize));
  const skipSize = Math.max(0, Math.round(params.skipSize));
  const period = bandSize + skipSize;
  const bandCount = Math.max(1, Math.round(params.bandCount));
  const direction = params.reverse ? -1 : 1;
  const travel = direction * ctx.positionInEffect01 * params.speed * 40;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ring = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (ring >= thickness) continue;

      const pos = perimeterPosition(x, y, W, H, ring);
      if (pos < 0) continue;

      const shifted = pos + travel + ring * params.stagger;
      const phase = ((shifted % period) + period) % period;
      if (phase >= bandSize) continue; // in the gap between bands

      const bandIndex = Math.floor(((shifted - phase) / period) % bandCount + bandCount) % bandCount;
      const color = palette[bandIndex % Math.max(1, palette.length)] ?? { r: 255, g: 255, b: 255, a: 255 };
      buffer.setPixel(x, y, color);
    }
  }
}

// Distance travelled clockwise around ring `r`'s rectangle to reach (x,y), or -1 if the pixel
// isn't on that ring's outline.
export function perimeterPosition(x: number, y: number, W: number, H: number, r: number): number {
  const left = r;
  const right = W - 1 - r;
  const bottom = r;
  const top = H - 1 - r;
  if (right < left || top < bottom) return -1;

  const w = right - left;
  const h = top - bottom;

  if (y === bottom) return x - left; // bottom edge, left to right
  if (x === right) return w + (y - bottom); // right edge, bottom to top
  if (y === top) return w + h + (right - x); // top edge, right to left
  if (x === left) return 2 * w + h + (top - y); // left edge, top to bottom
  return -1;
}

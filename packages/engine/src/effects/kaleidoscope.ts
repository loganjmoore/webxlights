import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";

export type KaleidoscopeType = "Square" | "Triangle" | "Rectangle";

export const KALEIDOSCOPE_TYPES: KaleidoscopeType[] = ["Square", "Triangle", "Rectangle"];

export interface KaleidoscopeParams {
  type: KaleidoscopeType;
  centerX: number; // 0-100, where the sample is taken from
  centerY: number;
  size: number; // 1-100, how big the sampled wedge is
  rotation: number; // degrees, turns the finished pattern
}

// Manual "Kaleidoscope": "a canvas mode effect. By itself it does nothing. It must be placed
// above another effect and it will modify the output... a Kaleidoscope will sample a section of
// the underlying effect and mirror it into a symmetrical pattern."
//
// Canvas mode is what makes this possible at all: the layer stack seeds the buffer with what the
// layers underneath drew, so `buffer` arrives holding the effect being sampled rather than
// blank. Every pixel is then rewritten from a *folded* coordinate, which is what mirroring is -
// a point outside the sample wedge is reflected back into it, so the whole model shows the same
// small piece repeated symmetrically.
export function renderKaleidoscope(buffer: RenderBuffer, params: KaleidoscopeParams): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  // The source has to be copied first: the fold reads from cells this pass is also writing, so
  // sampling in place would mirror pixels that had already been replaced.
  const source = new Array<ReturnType<typeof rgba>>(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) source[y * W + x] = buffer.getPixel(x, y);

  const cx = (Math.min(100, Math.max(0, params.centerX)) / 100) * (W - 1);
  const cy = (Math.min(100, Math.max(0, params.centerY)) / 100) * (H - 1);
  // Size is a share of the model, floored at one cell - a zero-wide sample has nothing to mirror
  // and would divide by itself.
  const half = Math.max(1, (Math.min(100, Math.max(1, params.size)) / 100) * Math.min(W, H) * 0.5);

  const rad = (-(params.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Rotation turns the *pattern*, so it is applied to the lookup rather than to the sample.
      const rx = (x - cx) * cos - (y - cy) * sin;
      const ry = (x - cx) * sin + (y - cy) * cos;
      const folded = fold(rx, ry, half, params.type);
      const sx = Math.round(cx + folded.x);
      const sy = Math.round(cy + folded.y);
      const inside = sx >= 0 && sx < W && sy >= 0 && sy < H;
      buffer.setPixel(x, y, inside ? source[sy * W + sx]! : rgba(0, 0, 0, 0));
    }
  }
}

// Folds an offset from the centre back into the sample area. Reflecting rather than wrapping is
// what makes the repeat symmetrical: a wrap would tile the sample, and a tiled sample is a grid,
// not a kaleidoscope.
function fold(dx: number, dy: number, half: number, type: KaleidoscopeType): { x: number; y: number } {
  if (type === "Triangle") {
    // A triangular sample: fold across the diagonal as well, so each square wedge is halved into
    // the triangle the manual names.
    const sq = { x: mirror(dx, half), y: mirror(dy, half) };
    return Math.abs(sq.y) > Math.abs(sq.x) ? { x: sq.y, y: sq.x } : sq;
  }
  if (type === "Rectangle") {
    // Twice as wide as it is tall, so the repeat reads across the model rather than around a
    // point - the useful shape on a wide matrix or a roofline.
    return { x: mirror(dx, half * 2), y: mirror(dy, half) };
  }
  return { x: mirror(dx, half), y: mirror(dy, half) };
}

// Triangle-wave reflection: 0..half maps to itself, half..2*half comes back down, and so on.
function mirror(value: number, half: number): number {
  const period = half * 2;
  const wrapped = ((value % period) + period) % period;
  return wrapped <= half ? wrapped : period - wrapped;
}

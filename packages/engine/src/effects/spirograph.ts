import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface SpirographParams {
  speed: number;
  outerRadius: number; // R, the fixed circle
  innerRadius: number; // r, the rolling circle
  distance: number; // d, how far the pen sits from the rolling circle's centre
  animate: number; // "d - Animation": how far the figure expands outwards over time
  length: number; // how much of the curve is drawn
}

// Manual "Spirograph": the curve traced by a point on a circle rolling inside a fixed one - a
// hypotrochoid. The manual notes "r should be <= R", which is the condition for the rolling
// circle to stay inside the fixed one; a larger r is clamped rather than left to draw a figure
// that escapes the buffer entirely.
//
// "Only one color can be used for the effect", per the manual, so this takes palette[0] and
// ignores the rest rather than spreading the palette along the curve.
export function renderSpirograph(buffer: RenderBuffer, palette: RGBA[], params: SpirographParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const color = palette[0] ?? rgba(255, 255, 255, 255);
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const scale = Math.min(W, H) / 2;

  const R = Math.max(1, params.outerRadius);
  const r = Math.max(1, Math.min(params.innerRadius, R));
  // Animation expands the pen's offset over the life of the effect, which is what makes the
  // figure breathe outwards instead of retracing one fixed curve.
  const d = Math.max(0, params.distance) * (1 + (params.animate / 100) * ctx.positionInEffect01);

  const phase = (ctx.frameIndexInEffect * Math.max(1, params.speed)) / 200;
  const arc = (Math.max(1, params.length) / 100) * Math.PI * 2 * (R / Math.max(1, gcd(R, r)));
  const steps = Math.max(64, Math.round(arc * 24));

  // The figure also spins, and it has to: a complete hypotrochoid is a *closed* curve, so
  // advancing the tracing phase alone re-draws the identical set of pixels and Speed appears to
  // do nothing at full Length. Rotating the whole figure is what "the speed at which the
  // spirograph will move" actually looks like, and it still reads correctly at partial Length,
  // where the drawn arc advances as well.
  const spin = phase;
  const spinCos = Math.cos(spin);
  const spinSin = Math.sin(spin);

  for (let i = 0; i < steps; i++) {
    const t = phase + (i / steps) * arc;
    const k = (R - r) / r;
    // Hypotrochoid, normalised by R so the figure fills the buffer rather than depending on the
    // absolute size of the two radii.
    const x = ((R - r) * Math.cos(t) + d * Math.cos(k * t)) / R;
    const y = ((R - r) * Math.sin(t) - d * Math.sin(k * t)) / R;
    const rx = x * spinCos - y * spinSin;
    const ry = x * spinSin + y * spinCos;
    buffer.setPixel(Math.round(cx + rx * scale), Math.round(cy + ry * scale), color);
  }
}

function gcd(a: number, b: number): number {
  let x = Math.round(Math.abs(a));
  let y = Math.round(Math.abs(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

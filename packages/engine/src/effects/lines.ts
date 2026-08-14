import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export interface LinesParams {
  lines: number;
  points: number; // vertices per line
  thickness: number;
  speed: number;
  tails: number; // how many past positions trail behind
  fadeTails: boolean;
}

// Manual "Lines": "inspired by the Mystify Screensaver in Windows" - polygons whose vertices
// bounce around the buffer, each leaving a trail of its own past positions.
//
// Stateless by construction: every vertex moves at a constant velocity and reflects off the
// walls, and reflection off an axis-aligned box has a closed form (fold the distance travelled
// back and forth across the span), so a vertex's position at frame N is a function of N. That
// keeps this on the cheap render path and makes scrubbing exact instead of replayed.
export function renderLines(buffer: RenderBuffer, palette: RGBA[], params: LinesParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const lineCount = Math.max(1, Math.trunc(params.lines));
  const pointCount = Math.max(2, Math.trunc(params.points));
  const tails = Math.max(0, Math.trunc(params.tails));
  const speed = Math.max(1, params.speed) / 10;

  for (let l = 0; l < lineCount; l++) {
    const color = palette[l % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);
    for (let t = tails; t >= 0; t--) {
      const frame = ctx.frameIndexInEffect - t * 2;
      if (frame < 0) continue;
      // The head is full strength; a tail either fades with age or holds its colour, which is
      // exactly what Fade Tails switches between.
      const alpha = t === 0 || !params.fadeTails ? 255 : Math.round(255 * (1 - t / (tails + 1)));
      const vertices: Array<{ x: number; y: number }> = [];
      for (let p = 0; p < pointCount; p++) {
        vertices.push(vertexAt(l, p, frame * speed, W, H, ctx.seed));
      }
      for (let p = 0; p < pointCount; p++) {
        const a = vertices[p]!;
        const b = vertices[(p + 1) % pointCount]!;
        drawLine(buffer, a, b, { ...color, a: alpha }, Math.max(1, Math.trunc(params.thickness)));
      }
    }
  }
}

// Closed-form bounce: travel `distance` from a start point and reflect off the walls by folding
// the total into a span of 2*(limit), which is the path a ball takes between two walls.
function bounce(start: number, velocity: number, distance: number, limit: number): number {
  if (limit <= 0) return 0;
  const period = limit * 2;
  const raw = (((start + velocity * distance) % period) + period) % period;
  return raw <= limit ? raw : period - raw;
}

function vertexAt(line: number, point: number, distance: number, W: number, H: number, seed: number): { x: number; y: number } {
  const rng = mulberry32(seed + line * 7919 + point * 104729);
  const x0 = rng() * (W - 1);
  const y0 = rng() * (H - 1);
  const vx = (rng() * 2 - 1) || 0.5;
  const vy = (rng() * 2 - 1) || 0.5;
  return { x: bounce(x0, vx, distance, W - 1), y: bounce(y0, vy, distance, H - 1) };
}

function drawLine(buffer: RenderBuffer, a: { x: number; y: number }, b: { x: number; y: number }, color: RGBA, thickness: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  const half = Math.floor((thickness - 1) / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) buffer.setPixel(x + dx, y + dy, color);
    }
  }
}

import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export type ShapeKind = "Circle" | "Square" | "Triangle" | "Star" | "Heart";

export const SHAPE_KINDS: ShapeKind[] = ["Circle", "Square", "Triangle", "Star", "Heart"];

export interface ShapeParams {
  shape: ShapeKind;
  thickness: number;
  count: number;
  startSize: number; // % of the buffer's smaller side
  randomSizes: boolean;
  velocity: number;
  direction: number; // degrees: 0 right, 90 up, 180 left, 270 down
  lifetime: number; // % of the effect a shape lives for
  growth: number; // -100..100, size change over a shape's life
  centerX: number; // 0-100
  centerY: number; // 0-100
}

// Manual "Shape": draws geometric shapes that move, grow and expire. The manual's own list runs
// to twelve including emoji and system-font glyphs; the five here are the ones drawable from
// geometry rather than from a font this engine doesn't have. Character/Emoji are recorded as a
// gap in docs/MANUAL-COVERAGE.md rather than approximated with a circle.
//
// The manual pins the direction convention exactly - "0 is right movement, 90 is up movement,
// 180 is left, 270 is down" - which is worth honouring rather than guessing, since the obvious
// screen-coordinate reading would put 90 downwards.
export function renderShape(buffer: RenderBuffer, palette: RGBA[], params: ShapeParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const count = Math.max(1, Math.trunc(params.count));
  const rad = (params.direction * Math.PI) / 180;
  const speed = params.velocity / 10;
  const lifetime = Math.max(1, params.lifetime) / 100;
  const smaller = Math.min(W, H);

  for (let i = 0; i < count; i++) {
    const rng = mulberry32(ctx.seed + i * 7919);
    // Shapes are staggered across the effect so they don't all appear and die together.
    const birth = (i / count) * lifetime;
    const age = ((ctx.positionInEffect01 - birth) % lifetime + lifetime) % lifetime;
    const life = age / lifetime; // 0..1 through this shape's own life

    const sizePct = params.randomSizes ? params.startSize * (0.4 + rng() * 1.2) : params.startSize;
    const size = Math.max(1, ((sizePct / 100) * smaller) / 2 + (params.growth / 100) * life * smaller * 0.5);
    if (size <= 0) continue;

    const travel = speed * age * smaller;
    const cx = (params.centerX / 100) * (W - 1) + Math.cos(rad) * travel;
    const cy = (params.centerY / 100) * (H - 1) + Math.sin(rad) * travel;

    const color = palette[i % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);
    drawShape(buffer, params.shape, cx, cy, size, Math.max(1, params.thickness), color);
  }
}

function drawShape(buffer: RenderBuffer, kind: ShapeKind, cx: number, cy: number, size: number, thickness: number, color: RGBA): void {
  // Every shape is drawn as an outline by testing each candidate pixel's distance from the
  // shape's boundary, which gives Thickness a single consistent meaning across all of them
  // rather than each shape inventing its own idea of a wall.
  const reach = Math.ceil(size + thickness);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = boundaryDistance(kind, dx, dy, size);
      if (Math.abs(d) <= thickness / 2) buffer.setPixel(Math.round(cx + dx), Math.round(cy + dy), color);
    }
  }
}

// Signed distance from the shape's edge: negative inside, positive outside.
function boundaryDistance(kind: ShapeKind, x: number, y: number, size: number): number {
  switch (kind) {
    case "Square":
      return Math.max(Math.abs(x), Math.abs(y)) - size;
    case "Triangle": {
      // Equilateral, pointing up.
      const k = Math.sqrt(3);
      const px = Math.abs(x) - size;
      const py = y + size / k;
      return Math.max(px * k * 0.5 + py * 0.5, -py) ;
    }
    case "Star":
      return starDistance(x, y, size, 5);
    case "Heart": {
      // The classic implicit heart, scaled to the requested size.
      const nx = x / size;
      const ny = -y / size;
      const v = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
      return v * size * 0.5;
    }
    default:
      return Math.hypot(x, y) - size;
  }
}

function starDistance(x: number, y: number, size: number, points: number): number {
  const angle = Math.atan2(y, x);
  const radius = Math.hypot(x, y);
  // Radius of the star's edge at this angle: sweeps between the outer and inner points.
  const step = (Math.PI * 2) / points;
  const local = ((angle % step) + step) % step;
  const t = Math.abs(local - step / 2) / (step / 2); // 1 at a point, 0 between two
  const edge = size * (0.45 + 0.55 * t);
  return radius - edge;
}

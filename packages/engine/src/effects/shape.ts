import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export type ShapeKind =
  | "Circle"
  | "Square"
  | "Triangle"
  | "Diamond"
  | "Star"
  | "Polygon"
  | "Heart"
  | "Tree"
  | "Candy Cane"
  | "Snow Flake"
  | "Crucifix"
  | "Present";

export const SHAPE_KINDS: ShapeKind[] = [
  "Circle",
  "Square",
  "Triangle",
  "Diamond",
  "Star",
  "Polygon",
  "Heart",
  "Tree",
  "Candy Cane",
  "Snow Flake",
  "Crucifix",
  "Present",
];

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
  /** "Rotation/sides of the shape, If supported" - a star's points, a polygon's sides. */
  points: number;
  /** "Rotation of the shape, If supported", in degrees. */
  rotation: number;
  /** "Use random start location for the shape." */
  randomLocation: boolean;
  /** "Use random movement for for the shape." */
  randomMovement: boolean;
  /** "Fade shape over its lifetime." */
  fadeAway: boolean;
}

// Manual "Shape": draws geometric shapes that move, grow and expire. The manual's list is
// "Circle, Square, Triangle, Star, Polygon, Heart, Tree, Candy Cane, Snow Flake, Crucifix,
// Present, Emoji" - all of which are here except Emoji and the system-font glyphs, which need a
// font this engine doesn't have and are recorded as a gap rather than approximated with a circle.
//
// Every shape is a signed distance function, which is what makes Thickness mean one thing across
// all of them and makes "filled or unfilled" a single test rather than a second set of drawing
// code. The composite shapes - a tree's canopy and trunk, a present's box and ribbon - are unions,
// and a union of distance fields is the smaller of the two.
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
    // Random location and movement are per-shape and drawn from that shape's own seeded RNG, so
    // they are scattered rather than random *per frame* - a shape that jumped every frame would
    // be noise, not motion.
    const originX = params.randomLocation ? rng() * (W - 1) : (params.centerX / 100) * (W - 1);
    const originY = params.randomLocation ? rng() * (H - 1) : (params.centerY / 100) * (H - 1);
    const heading = params.randomMovement ? rng() * Math.PI * 2 : rad;
    const cx = originX + Math.cos(heading) * travel;
    const cy = originY + Math.sin(heading) * travel;

    const base = palette[i % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);
    // "Fade shape over its lifetime" - fully lit when it appears and gone as it expires, which is
    // what stops a short lifetime looking like shapes blinking out.
    const color = params.fadeAway ? { ...base, a: Math.round(base.a * (1 - life)) } : base;
    if (color.a <= 0) continue;
    drawShape(buffer, params.shape, cx, cy, size, Math.max(1, params.thickness), color, {
      points: params.points,
      rotation: params.rotation,
    });
  }
}

export interface ShapeDrawOptions {
  /** Star points or polygon sides. Below three a polygon isn't a shape, so it is clamped. */
  points?: number;
  /** Degrees, anticlockwise. */
  rotation?: number;
  /** "Filled or Unfilled" - the VU Meter's Level Shape offers both. */
  filled?: boolean;
}

/**
 * Draws one shape, outlined or filled.
 *
 * Exported because the VU Meter's Level Shape type draws exactly these shapes at a size the audio
 * decides; a second copy of the geometry would be a second set of shapes to keep in step.
 */
export function drawShape(
  buffer: RenderBuffer,
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number,
  thickness: number,
  color: RGBA,
  options: ShapeDrawOptions = {},
): void {
  // Every shape is drawn by testing each candidate pixel's distance from the shape's boundary,
  // which gives Thickness a single consistent meaning across all of them rather than each shape
  // inventing its own idea of a wall - and makes filling it the same test with a different
  // comparison.
  const reach = Math.ceil(size + thickness);
  const points = Math.max(3, Math.round(options.points ?? 5));
  const rad = ((options.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      // Rotate the sample point the other way rather than the shape: the distance functions stay
      // axis-aligned, and one rotation serves all of them.
      const rx = dx * cos + dy * sin;
      const ry = -dx * sin + dy * cos;
      const d = boundaryDistance(kind, rx, ry, size, points);
      const hit = options.filled ? d <= thickness / 2 : Math.abs(d) <= thickness / 2;
      if (hit) buffer.setPixel(Math.round(cx + dx), Math.round(cy + dy), color);
    }
  }
}

// Signed distance from the shape's edge: negative inside, positive outside.
function boundaryDistance(kind: ShapeKind, x: number, y: number, size: number, points = 5): number {
  switch (kind) {
    case "Square":
      return Math.max(Math.abs(x), Math.abs(y)) - size;
    case "Diamond":
      // A square turned forty-five degrees, which is the same thing as measuring in city blocks.
      return Math.abs(x) + Math.abs(y) - size;
    case "Polygon":
      return polygonDistance(x, y, size, points);
    case "Triangle": {
      // Equilateral, pointing up.
      const k = Math.sqrt(3);
      const px = Math.abs(x) - size;
      const py = y + size / k;
      return Math.max(px * k * 0.5 + py * 0.5, -py) ;
    }
    case "Star":
      return starDistance(x, y, size, points);
    case "Heart": {
      // The classic implicit heart, scaled to the requested size.
      const nx = x / size;
      const ny = -y / size;
      const v = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
      return v * size * 0.5;
    }
    case "Tree": {
      // A canopy over a trunk. Drawn as three stacked triangles, which is what reads as a
      // Christmas tree at the size a prop actually is - one triangle reads as a triangle.
      const trunk = boxDistance(x, y - size * 0.8, size * 0.15, size * 0.2);
      let canopy = Infinity;
      for (let tier = 0; tier < 3; tier++) {
        const tierSize = size * (0.5 + tier * 0.22);
        const tierY = y + size * 0.55 - tier * size * 0.5;
        // A triangle: the wider of its two sloped sides and its flat bottom.
        const slope = Math.abs(x) * 1.6 + tierY;
        canopy = Math.min(canopy, Math.max(slope - tierSize, -(tierY + tierSize * 0.35)));
      }
      return Math.min(canopy, trunk);
    }
    case "Crucifix": {
      // Two bars, the upright longer than the arm and crossed above centre.
      const upright = boxDistance(x, y, size * 0.18, size);
      const arm = boxDistance(x, y + size * 0.25, size * 0.6, size * 0.18);
      return Math.min(upright, arm);
    }
    case "Present": {
      // A box with a ribbon over it, which is what tells it apart from Square.
      const box = boxDistance(x, y, size * 0.8, size * 0.7);
      const ribbonV = boxDistance(x, y, size * 0.1, size * 0.7);
      const ribbonH = boxDistance(x, y, size * 0.8, size * 0.1);
      return Math.min(box, Math.min(ribbonV, ribbonH));
    }
    case "Candy Cane": {
      // A straight shaft with a hook at the top: the hook is the top half of a ring.
      const shaft = segmentDistance(x, y, size * 0.35, -size * 0.2, size * 0.35, size) - size * 0.14;
      const hookRadius = size * 0.35;
      const ring = Math.abs(Math.hypot(x, y + size * 0.55) - hookRadius) - size * 0.14;
      const hook = y + size * 0.55 > 0 ? Math.hypot(x, y + size * 0.55) - hookRadius : ring;
      return Math.min(shaft, hook);
    }
    case "Snow Flake": {
      // Six spokes with a short crossbar on each - three lines through the centre plus their
      // branches, which is what makes it a snowflake rather than an asterisk.
      let best = Infinity;
      for (let arm = 0; arm < 3; arm++) {
        const angle = (arm * Math.PI) / 3;
        const ax = Math.cos(angle) * size;
        const ay = Math.sin(angle) * size;
        best = Math.min(best, segmentDistance(x, y, -ax, -ay, ax, ay) - size * 0.08);
        // A branch part-way along each spoke, on both ends.
        for (const sign of [1, -1]) {
          const bx = ax * 0.55 * sign;
          const by = ay * 0.55 * sign;
          const px = Math.cos(angle + Math.PI / 2) * size * 0.22;
          const py = Math.sin(angle + Math.PI / 2) * size * 0.22;
          best = Math.min(best, segmentDistance(x, y, bx - px, by - py, bx + px, by + py) - size * 0.06);
        }
      }
      return best;
    }
    default:
      return Math.hypot(x, y) - size;
  }
}

/**
 * A regular polygon of `sides`.
 *
 * The distance to the nearest edge plane, which for a convex polygon is the distance to the shape.
 */
function polygonDistance(x: number, y: number, size: number, sides: number): number {
  const step = (Math.PI * 2) / sides;
  const angle = Math.atan2(y, x);
  const radius = Math.hypot(x, y);
  // Fold the angle into one wedge, then measure across that wedge's flat edge.
  const local = ((angle % step) + step) % step;
  return radius * Math.cos(local - step / 2) - size * Math.cos(step / 2);
}

/** Distance to a line segment - the building block of the composite shapes. */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = x - ax;
  const wy = y - ay;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}

/** Distance to an axis-aligned box centred on the origin. */
function boxDistance(x: number, y: number, halfW: number, halfH: number): number {
  const dx = Math.abs(x) - halfW;
  const dy = Math.abs(y) - halfH;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
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

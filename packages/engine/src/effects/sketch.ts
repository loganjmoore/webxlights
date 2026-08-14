import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface SketchParams {
  /** The path definition, in this engine's own notation - see parseSketchPaths. */
  sketch: string;
  drawPercent: number; // % of the effect over which the sketch draws itself in
  thickness: number;
  motion: boolean;
  motionPercent: number; // how much of the sketch is showing at any moment, when Motion is on
}

export interface SketchPoint {
  x: number; // 0..1 across the model
  y: number; // 0..1 up it
}

// Manual "Sketch": "trace out a path (a 'sketch') and have it progressively drawn onto your model
// over the duration of the effect... each separate path uses the next color from your palette."
//
// The path is stored as text so it round-trips through the sequence body like any other param.
// The notation is deliberately the smallest thing that expresses what the effect needs: `M` starts
// a new path, `L` continues it, and coordinates are 0..1 so a sketch traced on one model renders
// on a differently-sized one.
//
//     M 0.1,0.1 L 0.9,0.1 L 0.5,0.9 M 0.2,0.5 L 0.8,0.5
//
// Not implemented: the Background image and its Opacity. Both are *tracing aids* - the manual is
// explicit that "the image is not rendered into the effect output - it is only there to help you
// trace" - so their absence changes nothing about what a sketch renders, only how convenient it
// is to draw one.
export function parseSketchPaths(definition: string): SketchPoint[][] {
  const paths: SketchPoint[][] = [];
  let current: SketchPoint[] | null = null;

  for (const token of (definition ?? "").trim().split(/\s+/)) {
    if (!token) continue;
    if (token === "M" || token === "m") {
      current = [];
      paths.push(current);
      continue;
    }
    if (token === "L" || token === "l") continue;
    const [rawX, rawY] = token.split(",");
    const x = parseFloat(rawX ?? "");
    const y = parseFloat(rawY ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // A coordinate before any M starts a path anyway, so a definition that omits the opening
    // marker still draws rather than silently rendering nothing.
    if (!current) {
      current = [];
      paths.push(current);
    }
    current.push({ x, y });
  }

  return paths.filter((p) => p.length > 0);
}

export function sketchToDefinition(paths: SketchPoint[][]): string {
  return paths
    .filter((p) => p.length > 0)
    .map((path) => `M ${path.map((p) => `${round(p.x)},${round(p.y)}`).join(" L ")}`)
    .join(" ");
}

function round(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

export function renderSketch(buffer: RenderBuffer, palette: RGBA[], params: SketchParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const paths = parseSketchPaths(params.sketch);
  if (paths.length === 0) return;

  // The whole sketch is one continuous line as far as progress is concerned, so a long path takes
  // proportionally longer to draw than a short one - which is what makes it look like drawing
  // rather than like each stroke appearing in turn.
  const lengths = paths.map(pathLength);
  const total = lengths.reduce((sum, l) => sum + l, 0) || 1;

  // Two modes, and the manual says they exclude each other: Draw Percentage is "the percentage of
  // the effect duration over which the sketch progressively draws on", with the finished sketch
  // staying visible afterwards; Motion instead "draws the sketch over the entire effect duration
  // but only a percentage of it is rendered at any given moment".
  let from = 0;
  let to: number;
  if (params.motion) {
    const window = clamp01(params.motionPercent / 100);
    to = ctx.positionInEffect01;
    from = Math.max(0, to - window);
  } else {
    const drawOver = Math.max(0.001, clamp01(params.drawPercent / 100));
    to = Math.min(1, ctx.positionInEffect01 / drawOver);
  }

  const reach = Math.max(1, Math.trunc(params.thickness));
  let travelled = 0;

  paths.forEach((path, index) => {
    // "Each separate path uses the next color from your selected palette."
    const color = palette[index % Math.max(1, palette.length)] ?? rgba(255, 255, 255, 255);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const segment = distance(a, b);
      const startAt = travelled / total;
      const endAt = (travelled + segment) / total;
      travelled += segment;

      if (endAt < from || startAt > to) continue;
      // A segment straddling the visible window is drawn only as far as the window reaches, so
      // the line grows smoothly instead of jumping a whole segment at a time.
      const span = endAt - startAt || 1;
      const t0 = clamp01((Math.max(from, startAt) - startAt) / span);
      const t1 = clamp01((Math.min(to, endAt) - startAt) / span);
      drawSegment(buffer, lerp(a, b, t0), lerp(a, b, t1), color, reach, W, H);
    }
  });
}

function pathLength(path: SketchPoint[]): number {
  let length = 0;
  for (let i = 0; i < path.length - 1; i++) length += distance(path[i]!, path[i + 1]!);
  return length;
}

function distance(a: SketchPoint, b: SketchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a: SketchPoint, b: SketchPoint, t: number): SketchPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function drawSegment(
  buffer: RenderBuffer,
  a: SketchPoint,
  b: SketchPoint,
  color: RGBA,
  thickness: number,
  width: number,
  height: number,
): void {
  const ax = a.x * (width - 1);
  const ay = a.y * (height - 1);
  const bx = b.x * (width - 1);
  const by = b.y * (height - 1);
  const steps = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const reach = Math.floor((thickness - 1) / 2);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) buffer.setPixel(x + dx, y + dy, color);
    }
  }
}

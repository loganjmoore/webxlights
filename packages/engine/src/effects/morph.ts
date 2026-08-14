import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface MorphParams {
  // The line the morph starts as, and the line it ends as, each given by its two endpoints as
  // percentages of the buffer. The manual's own names: X1a/Y1a and X1b/Y1b are the start line's
  // two ends, X2a/Y2a and X2b/Y2b the end line's.
  x1a: number;
  y1a: number;
  x1b: number;
  y1b: number;
  x2a: number;
  y2a: number;
  x2b: number;
  y2b: number;
  headLength: number; // % of the sweep held at the head colour
  headDuration: number; // % of the run the head keeps its own colour for
  acceleration: number; // -10..10, non-linear speed
  repeatCount: number;
  repeatSkip: number; // rows the morph steps sideways on each repeat
  stagger: number; // leans the sweep, so it arrives at one end before the other
  showHeadAtStart: boolean;
  swapStartEnd: boolean;
}

// Manual "Morph": "a Movement across a model of one or many strands of lights with a head and a
// tail... works best on mega trees, arches and matrices".
//
// The shape of it is a *line that travels*: the effect interpolates from the start line to the
// end line, and the ground it has already covered is filled in behind it. That filling-in is not
// a liberty - it is what the manual's colour rule describes, "three or more colours create
// progressive morphing sequences across head and tail sections", which only means anything if
// there is a swept region for the palette to be spread across.
//
// Stateless: the swept region at any moment is a closed form of the position in the effect, so a
// scrub renders the same picture the export does without replaying anything.
export function renderMorph(buffer: RenderBuffer, palette: RGBA[], params: MorphParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const repeats = Math.max(1, Math.trunc(params.repeatCount));
  // Each repeat gets its own slice of the effect and runs the whole sweep inside it, so Repeat
  // Count says how many times the morph happens rather than how fast it goes.
  const slice = 1 / repeats;
  const run = Math.min(repeats - 1, Math.floor(ctx.positionInEffect01 / slice));
  const withinRun = (ctx.positionInEffect01 - run * slice) / slice;

  const t = accelerate(withinRun, params.acceleration);
  // Repeat Skip: "sets the number of legs on the model that the morph will skip". A leg is a row
  // of the buffer, so each repeat starts that many rows further along.
  const skip = Math.trunc(params.repeatSkip) * run;

  const [startA, startB, endA, endB] = params.swapStartEnd
    ? [point(params.x2a, params.y2a, W, H), point(params.x2b, params.y2b, W, H), point(params.x1a, params.y1a, W, H), point(params.x1b, params.y1b, W, H)]
    : [point(params.x1a, params.y1a, W, H), point(params.x1b, params.y1b, W, H), point(params.x2a, params.y2a, W, H), point(params.x2b, params.y2b, W, H)];

  const head = palette[0] ?? rgba(255, 255, 255, 255);
  const headFraction = Math.min(1, Math.max(0, params.headLength / 100));
  // "Head Duration: defines how long the head will show during the morph before it changes to
  // the body colors." Past that point the leading edge stops being picked out.
  const headStillShowing = withinRun * 100 <= Math.max(0, params.headDuration);

  if (params.showHeadAtStart && withinRun === 0) {
    drawLine(buffer, startA, startB, head, skip, 0, params.stagger);
    return;
  }

  // Enough samples that the sweep is solid rather than a set of visibly separate lines, even
  // when it crosses the whole model.
  const steps = Math.max(2, Math.round(t * Math.max(W, H) * 2) + 1);
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * t; // how far along the sweep this line is
    const a = lerpPoint(startA, endA, s);
    const b = lerpPoint(startB, endB, s);

    const distanceBehindHead = t > 0 ? (t - s) / t : 0;
    const inHead = headStillShowing && distanceBehindHead <= headFraction;
    // Behind the head the palette is spread across the tail, oldest ground at the far end, which
    // is what makes a gradient palette read as one continuous morph rather than as bands.
    const color = inHead ? head : tailColor(palette, distanceBehindHead);
    drawLine(buffer, a, b, color, skip, s, params.stagger);
  }
}

interface Point {
  x: number;
  y: number;
}

function point(xPct: number, yPct: number, width: number, height: number): Point {
  return { x: (xPct / 100) * (width - 1), y: (yPct / 100) * (height - 1) };
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// "Acceleration: creates non-linear speed for the movement." Positive starts slow and finishes
// fast, negative the other way; 0 is a constant speed.
function accelerate(t: number, acceleration: number): number {
  const a = Math.max(-10, Math.min(10, acceleration || 0));
  if (a === 0) return t;
  const power = a > 0 ? 1 + a / 5 : 1 / (1 - a / 5);
  return Math.pow(t, power);
}

function tailColor(palette: RGBA[], distanceBehindHead: number): RGBA {
  if (palette.length === 0) return rgba(255, 255, 255, 255);
  if (palette.length === 1) return palette[0]!;
  // The body is the palette *after* the head colour: "two colors apply the first to the head and
  // second to the tail", and with three or more the rest are spread across the tail. Including
  // palette[0] here would leave the body starting in the head's own colour, so a head that had
  // ended would still look like a head.
  const body = palette.slice(1);
  if (body.length === 1) return body[0]!;
  const scaled = Math.min(0.999999, Math.max(0, distanceBehindHead)) * (body.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  const from = body[i]!;
  const to = body[i + 1] ?? from;
  return rgba(
    Math.round(from.r + (to.r - from.r) * f),
    Math.round(from.g + (to.g - from.g) * f),
    Math.round(from.b + (to.b - from.b) * f),
    255,
  );
}

// Stagger "allows for left or right sweeping type morphs": the far end of the line lags behind
// the near end, so the morph arrives at one side of the model before the other instead of
// landing everywhere at once. The manual recommends values between 1 and 4.
function drawLine(buffer: RenderBuffer, a: Point, b: Point, color: RGBA, rowSkip: number, sweep: number, stagger: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  const lean = Math.max(0, stagger || 0) / 10;

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // A point is only drawn once the sweep has reached its share of the lean; at stagger 0 that
    // is every point at once, which is the un-staggered line.
    if (lean > 0 && sweep < u * lean) continue;
    const x = Math.round(a.x + dx * u);
    const y = Math.round(a.y + dy * u) + rowSkip;
    buffer.setPixel(x, y, color);
  }
}

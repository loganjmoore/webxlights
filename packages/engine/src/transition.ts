import type { RenderBuffer } from "./renderBuffer";

// SPEC ch9 "layer transitions": an In/Out reveal applied to a layer independently of what the
// effect itself draws. M6 originally shipped Fade only; this is the full system.
//
// Every non-Fade transition is expressed as an *order field*: a scalar `order(x,y)` in [0,1]
// saying how early that pixel joins the reveal. A pixel is shown once `order <= progress`,
// with a short soft edge so the boundary isn't aliased. Defining transitions this way makes
// them total by construction — progress 0 always reveals nothing and progress 1 always reveals
// everything, whatever the shape — and adding a new one is a single pure function.

export type TransitionType =
  | "Fade"
  | "Wipe"
  | "Wipe Vertical"
  | "From Middle"
  | "To Middle"
  | "Square Explode"
  | "Square Implode"
  | "Circle Explode"
  | "Circle Implode"
  | "Clock"
  | "Blinds"
  | "Slide Bars"
  | "Bow Tie"
  | "Star"
  | "Checkerboard"
  | "Ripple";

export const TRANSITION_TYPES: TransitionType[] = [
  "Fade",
  "Wipe",
  "Wipe Vertical",
  "From Middle",
  "To Middle",
  "Square Explode",
  "Square Implode",
  "Circle Explode",
  "Circle Implode",
  "Clock",
  "Blinds",
  "Slide Bars",
  "Bow Tie",
  "Star",
  "Checkerboard",
  "Ripple",
];

// Transitions whose `adjust` knob means something (pattern count); the rest ignore it.
export const PATTERNED_TRANSITION_TYPES = new Set<TransitionType>(["Blinds", "Slide Bars", "Checkerboard"]);

export interface TransitionSpec {
  inType?: TransitionType; // default "Fade"
  inDurationMs?: number;
  inAdjust?: number; // 0-100 pattern knob
  inReverse?: boolean;
  outType?: TransitionType; // default "Fade"
  outDurationMs?: number;
  outAdjust?: number;
  outReverse?: boolean;
}

const SOFT_EDGE = 0.06; // reveal boundary width in `progress` units
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

interface MaskOptions {
  adjust01: number;
  reverse: boolean;
}

// How early pixel (x,y) joins the reveal, 0 = first, 1 = last.
function orderAt(type: TransitionType, x: number, y: number, W: number, H: number, opts: MaskOptions): number {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const halfW = Math.max(1, W / 2);
  const halfH = Math.max(1, H / 2);
  const dx = Math.abs(x - cx) / halfW;
  const dy = Math.abs(y - cy) / halfH;
  const nx = W > 1 ? x / (W - 1) : 0;
  const ny = H > 1 ? y / (H - 1) : 0;
  const maxDist = Math.hypot(halfW, halfH) || 1;
  const dist = Math.hypot(x - cx, y - cy) / maxDist;

  let order: number;
  switch (type) {
    case "Fade":
      order = 0; // handled before this is called; kept total for safety
      break;
    case "Wipe":
      order = nx;
      break;
    case "Wipe Vertical":
      order = ny;
      break;
    case "From Middle":
      order = dx;
      break;
    case "To Middle":
      order = 1 - dx;
      break;
    case "Square Explode":
      order = Math.max(dx, dy);
      break;
    case "Square Implode":
      order = 1 - Math.max(dx, dy);
      break;
    case "Circle Explode":
      order = dist;
      break;
    case "Circle Implode":
      order = 1 - dist;
      break;
    case "Clock": {
      // sweep clockwise from 12 o'clock
      const angle = Math.atan2(x - cx, y - cy); // 0 at 12 o'clock, grows clockwise
      order = ((angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI));
      break;
    }
    case "Blinds": {
      const bands = patternCount(opts.adjust01, 2, 12);
      const bandW = Math.max(1, W / bands);
      order = (x % bandW) / bandW;
      break;
    }
    case "Slide Bars": {
      const bands = patternCount(opts.adjust01, 2, 12);
      const bandH = Math.max(1, H / bands);
      const band = Math.floor(y / bandH);
      order = band % 2 === 0 ? nx : 1 - nx;
      break;
    }
    case "Bow Tie": {
      // the two horizontal wedges sweep in from the sides first, then the top/bottom wedges
      order = dy <= dx ? (1 - dx) * 0.5 : 0.5 + (1 - dy) * 0.5;
      break;
    }
    case "Star": {
      // 5-pointed star grown from the centre: normalise the radius by the star's own outline
      const angle = Math.atan2(y - cy, x - cx);
      const lobe = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(5 * angle));
      order = clamp01(dist / lobe);
      break;
    }
    case "Checkerboard": {
      const cells = patternCount(opts.adjust01, 2, 12);
      const cw = Math.max(1, W / cells);
      const ch = Math.max(1, H / cells);
      const cellX = Math.floor(x / cw);
      const cellY = Math.floor(y / ch);
      // deterministic scatter so cells don't appear in a single readable sweep
      order = (((cellX * 7 + cellY * 13) % 16) + 0.5) / 16;
      break;
    }
    case "Ripple": {
      order = clamp01(dist + 0.18 * Math.sin(dist * 12));
      break;
    }
    default:
      order = 0;
  }

  order = clamp01(order);
  return opts.reverse ? 1 - order : order;
}

function patternCount(adjust01: number, min: number, max: number): number {
  return Math.max(min, Math.round(min + adjust01 * (max - min)));
}

// Multiply the buffer's alpha by this transition's reveal at `progress` (0 = hidden, 1 = full).
function applyReveal(buffer: RenderBuffer, type: TransitionType, progress: number, opts: MaskOptions): void {
  if (progress >= 1) return;

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const c = buffer.getPixel(x, y);
      if (c.a === 0) continue;
      const factor =
        type === "Fade"
          ? clamp01(progress)
          : clamp01((progress - orderAt(type, x, y, buffer.width, buffer.height, opts)) / SOFT_EDGE);
      if (factor >= 1) continue;
      buffer.setPixel(x, y, { ...c, a: Math.round(c.a * factor) });
    }
  }
}

// In/Out progress at `atMs`: 1 once the transition window has passed, 0 at the very edge.
export function transitionProgress(
  effect: { startMs: number; endMs: number },
  atMs: number,
  transition: TransitionSpec,
): { inProgress: number; outProgress: number } {
  const inDur = transition.inDurationMs ?? 0;
  const outDur = transition.outDurationMs ?? 0;
  return {
    inProgress: inDur > 0 ? clamp01((atMs - effect.startMs) / inDur) : 1,
    outProgress: outDur > 0 ? clamp01((effect.endMs - atMs) / outDur) : 1,
  };
}

export function applyTransitions(
  buffer: RenderBuffer,
  effect: { startMs: number; endMs: number },
  atMs: number,
  transition: TransitionSpec,
): void {
  const { inProgress, outProgress } = transitionProgress(effect, atMs, transition);

  if (inProgress < 1) {
    applyReveal(buffer, transition.inType ?? "Fade", inProgress, {
      adjust01: clamp01((transition.inAdjust ?? 50) / 100),
      reverse: transition.inReverse ?? false,
    });
  }
  if (outProgress < 1) {
    applyReveal(buffer, transition.outType ?? "Fade", outProgress, {
      adjust01: clamp01((transition.outAdjust ?? 50) / 100),
      reverse: transition.outReverse ?? false,
    });
  }
}

// Back-compat name from the Fade-only implementation: a spec with no `*Type` set is a fade,
// so this is exactly `applyTransitions` for those specs.
export const applyFadeTransition = applyTransitions;

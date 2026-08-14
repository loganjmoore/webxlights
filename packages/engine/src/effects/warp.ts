import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export type WarpType = "Ripple" | "Single Water Drop" | "Circle Reveal" | "Banded Swirl" | "Circular Swirl" | "Wavy" | "Drop" | "Dissolve";
export type WarpTreatment = "Constant" | "In" | "Out";

export const WARP_TYPES: WarpType[] = [
  "Ripple",
  "Single Water Drop",
  "Circle Reveal",
  "Banded Swirl",
  "Circular Swirl",
  "Wavy",
  "Drop",
  "Dissolve",
];
export const WARP_TREATMENTS: WarpTreatment[] = ["Constant", "In", "Out"];

export interface WarpParams {
  type: WarpType;
  treatment: WarpTreatment;
  x: number; // 0-100, where on the model the warp is centred
  y: number;
  cycleCount: number;
  speed: number;
  frequency: number;
}

// Manual "Warp": "a canvas mode effect... distorts the pixels in the layers below it", and it
// "requires canvas mode to be enabled in Layer Blending to function".
//
// Every type here is one function: where does this pixel read from instead of itself. That is
// what a distortion *is*, and writing it that way means the eight types share all the machinery
// and differ only in one displacement each. Dissolve is the exception - it removes pixels rather
// than moving them - and is handled separately for that reason.
//
// Sampled backwards from each destination pixel, like every other resampling in this engine: a
// forward scatter leaves holes wherever the displacement stretches the grid.
export function renderWarp(buffer: RenderBuffer, params: WarpParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const source: RGBA[] = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) source[y * W + x] = buffer.getPixel(x, y);

  const cx = (Math.min(100, Math.max(0, params.x)) / 100) * (W - 1);
  const cy = (Math.min(100, Math.max(0, params.y)) / 100) * (H - 1);
  const progress = treatmentProgress(params, ctx.positionInEffect01);
  const frequency = Math.max(0.1, params.frequency || 1);
  const strength = Math.max(0, params.speed || 10) / 10;

  if (params.type === "Dissolve") {
    // "Pieces disappear and reappear." Nothing moves, so this doesn't resample - it decides per
    // pixel whether it survives this frame, with a threshold that sweeps as the effect runs.
    const rng = mulberry32(ctx.seed);
    const keep: number[] = new Array(W * H);
    for (let i = 0; i < W * H; i++) keep[i] = rng();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (keep[y * W + x]! < progress) buffer.setPixel(x, y, rgba(0, 0, 0, 0));
      }
    }
    return;
  }

  const maxRadius = Math.max(1, Math.hypot(W, H) / 2);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      let sx = x;
      let sy = y;

      switch (params.type) {
        case "Ripple":
        case "Single Water Drop": {
          // Concentric waves pushing pixels along the radius. A single drop's wave is a pulse
          // travelling outwards rather than a standing pattern, which is the whole difference.
          const wave =
            params.type === "Ripple"
              ? Math.sin(radius * frequency * 0.5 - progress * Math.PI * 2 * Math.max(1, params.cycleCount))
              : Math.sin((radius - progress * maxRadius) * frequency * 0.5) * Math.max(0, 1 - Math.abs(radius - progress * maxRadius) / (maxRadius / 3));
          const shift = wave * strength * 2;
          sx = x + Math.cos(angle) * shift;
          sy = y + Math.sin(angle) * shift;
          break;
        }
        case "Circle Reveal": {
          // Not a displacement: everything outside the growing circle is cleared, so the layer
          // below is revealed from the centre out.
          if (radius > progress * maxRadius) {
            buffer.setPixel(x, y, rgba(0, 0, 0, 0));
            continue;
          }
          break;
        }
        case "Banded Swirl": {
          // A swirl whose angle steps in bands rather than varying smoothly, which is what mixes
          // the colours into stripes instead of smearing them.
          const band = Math.floor(radius * frequency * 0.25);
          const twist = (band % 2 === 0 ? 1 : -1) * progress * strength;
          sx = cx + Math.cos(angle + twist) * radius;
          sy = cy + Math.sin(angle + twist) * radius;
          break;
        }
        case "Circular Swirl": {
          // Twist falls off with distance, so the centre turns and the edge stays put - the
          // whirlpool shape.
          const twist = (1 - Math.min(1, radius / maxRadius)) * progress * strength * Math.PI;
          sx = cx + Math.cos(angle + twist) * radius;
          sy = cy + Math.sin(angle + twist) * radius;
          break;
        }
        case "Wavy": {
          // "Simulates a flag waving" - a travelling wave across the model, not around a point.
          sx = x + Math.sin(y * frequency * 0.4 + progress * Math.PI * 2 * Math.max(1, params.cycleCount)) * strength * 2;
          break;
        }
        case "Drop": {
          // "Melting downwards": each column sags, further the lower it already is.
          sy = y + progress * strength * (y / Math.max(1, H - 1)) * H * 0.5;
          break;
        }
      }

      const rx = Math.round(sx);
      const ry = Math.round(sy);
      const inside = rx >= 0 && rx < W && ry >= 0 && ry < H;
      buffer.setPixel(x, y, inside ? source[ry * W + rx]! : rgba(0, 0, 0, 0));
    }
  }
}

// "Constant repeats the effect, In performs it once in the inward direction and Out performs it
// once outward." Constant is therefore a sawtooth over the cycle count; the two one-shot
// treatments are a single pass, one of them reversed.
function treatmentProgress(params: WarpParams, position01: number): number {
  if (params.treatment === "In") return 1 - position01;
  if (params.treatment === "Out") return position01;
  const cycles = Math.max(1, Math.trunc(params.cycleCount));
  return (position01 * cycles) % 1;
}

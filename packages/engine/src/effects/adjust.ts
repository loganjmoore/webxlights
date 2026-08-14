import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";

export type AdjustMode =
  | "None"
  | "Adjust By Value"
  | "Adjust By Percentage"
  | "Set Minimum"
  | "Set Maximum"
  | "Set Range"
  | "Shift With Wrap By Value"
  | "Shift With Wrap By Percentage"
  | "Prevent Range"
  | "Reverse";

export const ADJUST_MODES: AdjustMode[] = [
  "None",
  "Adjust By Value",
  "Adjust By Percentage",
  "Set Minimum",
  "Set Maximum",
  "Set Range",
  "Shift With Wrap By Value",
  "Shift With Wrap By Percentage",
  "Prevent Range",
  "Reverse",
];

export interface AdjustParams {
  mode: AdjustMode;
  value: number; // 0-255 for the by-value modes, 0-100 for the percentage ones
  minimum: number; // 0-255, the floor for Set Range / Prevent Range
  maximum: number;
}

// Manual "Adjust": "used Canvas mode to offset channel values. Can be used to offset DMX channel
// values."
//
// A canvas effect, so the buffer arrives holding what the layers underneath drew and this
// rewrites it. Nothing is drawn and nothing moves - every mode is one function applied to each
// channel of each pixel, which is why they can all share one loop.
//
// Alpha is left alone throughout. These modes are about channel *values*; changing coverage as
// well would make "Set Minimum" light pixels the layer below had deliberately left dark.
export function renderAdjust(buffer: RenderBuffer, params: AdjustParams): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0 || params.mode === "None") return;

  const adjust = channelAdjuster(params);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = buffer.getPixel(x, y);
      if (p.a === 0) continue; // nothing underneath here to adjust
      buffer.setPixel(x, y, rgba(adjust(p.r), adjust(p.g), adjust(p.b), p.a));
    }
  }
}

function channelAdjuster(params: AdjustParams): (channel: number) => number {
  const value = params.value ?? 0;
  const min = clamp(params.minimum ?? 0);
  const max = clamp(params.maximum ?? 255);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  switch (params.mode) {
    case "Adjust By Value":
      return (c) => clamp(c + value);
    case "Adjust By Percentage":
      return (c) => clamp(c * (1 + value / 100));
    case "Set Minimum":
      // A floor, so a channel already above it is untouched - this is how a fixture that goes
      // dark below a threshold is kept alight.
      return (c) => Math.max(clamp(value), c);
    case "Set Maximum":
      return (c) => Math.min(clamp(value), c);
    case "Set Range":
      // Rescales into the range rather than clipping to it, so the shape of what was underneath
      // survives - clipping would flatten everything outside the range to its edges.
      return (c) => clamp(lo + (c / 255) * (hi - lo));
    case "Shift With Wrap By Value":
      return (c) => wrap(c + value);
    case "Shift With Wrap By Percentage":
      return (c) => wrap(c + (value / 100) * 255);
    case "Prevent Range":
      // The opposite of Set Range: values inside the range are pushed out to whichever edge they
      // are nearer, which is how a range a fixture misbehaves in gets avoided.
      return (c) => (c >= lo && c <= hi ? (c - lo < hi - c ? lo : hi) : c);
    case "Reverse":
      return (c) => 255 - c;
    default:
      return (c) => c;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function wrap(v: number): number {
  const r = Math.round(v) % 256;
  return r < 0 ? r + 256 : r;
}

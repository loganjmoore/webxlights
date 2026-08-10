import type { RGBA } from "../color";
import { hsvToRgb, rgbToHsv } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { resolveParam, type CurvedNumber } from "../valueCurve";

export interface OnParams {
  startIntensity: number; // 0-100
  endIntensity: number; // 0-100
  transparencyPct: CurvedNumber; // 0-100, 100 = fully transparent; VC-eligible (SPEC ch9)
  cycles: number; // ramp repeats N times per effect (sawtooth)
  shimmer: boolean;
}

export interface OnFrameContext {
  frameIndexInEffect: number; // frames since effect start (shimmer parity)
  positionInEffect01: number; // 0..1 across effect duration (start->end ramp)
}

// SPEC ch8 "On": stateless per-frame fill. Spatial color branch deferred to a later milestone.
export function renderOn(buffer: RenderBuffer, palette: RGBA[], params: OnParams, ctx: OnFrameContext): void {
  let cidx = 0;
  if (params.shimmer) {
    if (ctx.frameIndexInEffect % 2 !== 0) {
      if (palette.length <= 1) return; // odd frames draw nothing with 1 color
      cidx = 1;
    }
  }
  const base = palette[cidx]!;
  const adjust = sawtooth(ctx.positionInEffect01 * params.cycles);

  let color: RGBA;
  if (params.startIntensity === 100 && params.endIntensity === 100) {
    color = base;
  } else {
    const hsv = rgbToHsv(base);
    const d = (params.startIntensity + (params.endIntensity - params.startIntensity) * adjust) / 100;
    color = hsvToRgb(hsv.h, hsv.s, hsv.v * d, base.a);
  }

  const transparencyPct = resolveParam(params.transparencyPct, ctx.positionInEffect01);
  if (transparencyPct > 0) {
    color = { ...color, a: Math.round(255 - (transparencyPct * 255) / 100) };
  }

  buffer.fill(color);
}

function sawtooth(x: number): number {
  return x - Math.floor(x);
}

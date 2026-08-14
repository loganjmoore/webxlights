import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export interface CandleParams {
  flameAgility: number; // how fast the flicker moves
  windBaseline: number; // brightness the flicker sits around
  windVariability: number; // how far it swings
  windCalmness: number; // how smoothly it gets there
  perNode: boolean;
  useColorPalette: boolean;
}

// Manual "Candle": "By default the Color Palette is not used and the flame is always an orange
// to reddish color." So the palette is opt-in here, the other way round from every other effect
// - worth honouring rather than quietly treating the palette as authoritative.
const FLAME_HOT = rgba(255, 200, 60, 255);
const FLAME_COOL = rgba(200, 60, 0, 255);

export function renderCandle(buffer: RenderBuffer, palette: RGBA[], params: CandleParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const baseline = Math.min(100, Math.max(0, params.windBaseline)) / 100;
  const variability = Math.min(100, Math.max(0, params.windVariability)) / 100;
  // Calmness damps the flicker: a calm candle barely moves, a draughty one swings hard. It
  // scales the swing rather than smoothing over time, because this effect is a pure function of
  // the frame index and has no previous frame to smooth against.
  const calm = 1 - Math.min(100, Math.max(0, params.windCalmness)) / 100;
  const agility = Math.max(1, params.flameAgility);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Per Node gives every pixel its own flicker; otherwise the whole model flickers together,
      // which is what you want for a model that *is* one candle.
      const cell = params.perNode ? y * W + x : 0;
      const rng = mulberry32(ctx.seed + cell * 7919 + Math.floor(ctx.frameIndexInEffect / Math.max(1, 21 - agility)));
      const swing = (rng() * 2 - 1) * variability * calm;
      const level = Math.min(1, Math.max(0, baseline + swing));

      const color = params.useColorPalette ? paletteFlame(palette, level) : mix(FLAME_COOL, FLAME_HOT, level);
      buffer.setPixel(x, y, { ...color, a: Math.round(255 * (0.35 + 0.65 * level)) });
    }
  }
}

function paletteFlame(palette: RGBA[], level: number): RGBA {
  if (palette.length === 0) return FLAME_HOT;
  if (palette.length === 1) return palette[0]!;
  const scaled = Math.min(0.999999, level) * (palette.length - 1);
  const i = Math.floor(scaled);
  return mix(palette[i]!, palette[i + 1] ?? palette[i]!, scaled - i);
}

function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return rgba(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
    255,
  );
}

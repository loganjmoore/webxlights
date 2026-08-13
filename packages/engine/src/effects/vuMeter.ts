import type { RGBA } from "../color";
import { multiColorBlend, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { audioOf, type FrameContext } from "./types";

export type VuMeterType =
  | "Spectrum"
  | "Volume Bars"
  | "Level Bar"
  | "Level Pulse"
  | "Level Color"
  | "Intensity Wave"
  | "Waveform";

export const VU_METER_TYPES: VuMeterType[] = [
  "Spectrum",
  "Volume Bars",
  "Level Bar",
  "Level Pulse",
  "Level Color",
  "Intensity Wave",
  "Waveform",
];

export interface VuMeterParams {
  type: VuMeterType;
  bars: number; // 1-32
  gainPct: number; // 0-300, multiplies the analysed level
  sensitivityPct: number; // 0-100, trigger threshold for the pulse types
}

// SPEC ch8 "VU Meter": the audio-reactive effect family. Everything it draws comes from the
// AudioFrame on the render context (audio.ts) - a per-frame level plus a log-spaced spectrum
// analysed once up front from the decoded track. With no audio loaded the frame reads as
// silence and the effect renders nothing, rather than failing.
export function renderVuMeter(buffer: RenderBuffer, palette: RGBA[], params: VuMeterParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  // No analysed track at all (no audio loaded for the sequence) renders nothing, rather than
  // the "zero level" appearance - a solid bottom-of-palette wash reads as a bug, not as silence.
  if (!ctx.audio) return;

  const audio = audioOf(ctx);
  const gain = Math.max(0, params.gainPct) / 100;
  const level = Math.min(1, audio.level * gain);
  const bars = Math.max(1, Math.round(params.bars));
  const threshold = Math.max(0, Math.min(1, params.sensitivityPct / 100));

  switch (params.type) {
    case "Spectrum":
      drawBars(buffer, palette, bars, (b) => Math.min(1, bandValue(audio.bands, b, bars) * gain));
      break;
    case "Volume Bars":
      drawBars(buffer, palette, bars, () => level);
      break;
    case "Level Bar": {
      const top = Math.round(level * H);
      for (let y = 0; y < top; y++) {
        const color = multiColorBlend(palette, H > 1 ? y / (H - 1) : 0, false);
        for (let x = 0; x < W; x++) buffer.setPixel(x, y, color);
      }
      break;
    }
    case "Level Pulse": {
      if (level < threshold) return;
      const color = palette[0] ?? rgba(255, 255, 255, 255);
      buffer.fill({ ...color, a: Math.round(255 * level) });
      break;
    }
    case "Level Color": {
      const color = multiColorBlend(palette, level, false);
      buffer.fill(color);
      break;
    }
    case "Intensity Wave": {
      // brightness follows the level; a travelling sine gives it spatial shape
      const color = palette[0] ?? rgba(255, 255, 255, 255);
      for (let x = 0; x < W; x++) {
        const wave = 0.5 + 0.5 * Math.sin((x / Math.max(1, W)) * 4 * Math.PI + ctx.positionInEffect01 * 20);
        const alpha = Math.round(255 * level * wave);
        if (alpha <= 0) continue;
        for (let y = 0; y < H; y++) buffer.setPixel(x, y, { ...color, a: alpha });
      }
      break;
    }
    case "Waveform":
    default: {
      // spectrum drawn as a centred waveform rather than bars from the floor
      const mid = (H - 1) / 2;
      for (let x = 0; x < W; x++) {
        const v = Math.min(1, bandValue(audio.bands, Math.floor((x / Math.max(1, W)) * bars), bars) * gain);
        const half = v * mid;
        const color = multiColorBlend(palette, v, false);
        for (let y = Math.round(mid - half); y <= Math.round(mid + half); y++) buffer.setPixel(x, y, color);
      }
      break;
    }
  }
}

// Resample the analysed band array onto the requested bar count.
function bandValue(bands: number[], bar: number, bars: number): number {
  if (bands.length === 0) return 0;
  const idx = Math.min(bands.length - 1, Math.floor((bar / Math.max(1, bars)) * bands.length));
  return bands[Math.max(0, idx)]!;
}

function drawBars(buffer: RenderBuffer, palette: RGBA[], bars: number, heightOf: (bar: number) => number): void {
  const { width: W, height: H } = buffer;
  const barWidth = W / bars;
  for (let b = 0; b < bars; b++) {
    const top = Math.round(heightOf(b) * H);
    if (top <= 0) continue;
    const x0 = Math.floor(b * barWidth);
    const x1 = Math.max(x0 + 1, Math.floor((b + 1) * barWidth));
    const color = multiColorBlend(palette, bars > 1 ? b / (bars - 1) : 0, false);
    for (let x = x0; x < x1 && x < W; x++) {
      for (let y = 0; y < top && y < H; y++) buffer.setPixel(x, y, color);
    }
  }
}

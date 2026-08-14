import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { audioOf, type FrameContext } from "./types";

export type MusicType = "Separate" | "Morph" | "Bounce" | "Collide" | "On";
export type MusicColor = "Distinct" | "Blend" | "Cycle";

export const MUSIC_TYPES: MusicType[] = ["Separate", "Morph", "Bounce", "Collide", "On"];

export interface MusicParams {
  bars: number;
  type: MusicType;
  sensitivity: number; // threshold the music has to clear before a bar shows
  offset: number; // horizontal shift, in bars
  scaleBars: boolean; // spread the bars across the whole buffer
  color: MusicColor;
  fade: boolean;
  logarithmicX: boolean;
}

// Manual "Music": "analyses and displays a representation of the frequency breakdown of the song
// from the waveform. Select at least two colors."
//
// It reads the same offline FFT the VU Meter does (audio.ts), so it renders identically in the
// preview, the popped-out preview and the exported .fseq - a live analyser would give a
// different answer on every run and break the determinism the export depends on.
export function renderMusic(buffer: RenderBuffer, palette: RGBA[], params: MusicParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const audio = audioOf(ctx);
  if (W <= 0 || H <= 0 || audio.bands.length === 0) return;

  const barCount = Math.max(1, Math.min(Math.trunc(params.bars), W));
  const threshold = Math.min(100, Math.max(0, params.sensitivity)) / 100;
  const barWidth = params.scaleBars ? W / barCount : 1;

  for (let b = 0; b < barCount; b++) {
    const level = bandLevel(audio.bands, b, barCount, params.logarithmicX);
    if (level <= threshold) continue;
    // Above the threshold the bar shows how far past it the music got, so raising sensitivity
    // both hides quiet bars and shortens the loud ones - "reduces the effects", as the manual
    // puts it, rather than only gating them.
    const scaled = (level - threshold) / Math.max(1e-6, 1 - threshold);
    const height = Math.max(1, Math.round(scaled * H));

    const color = barColor(palette, b, barCount, params.color, level);
    const alpha = params.fade ? Math.round(255 * (1 - ctx.positionInEffect01)) : 255;

    const startX = Math.round((b + params.offset) * barWidth);
    for (let dx = 0; dx < Math.max(1, Math.round(barWidth)); dx++) {
      const x = ((startX + dx) % W + W) % W;
      for (const y of barRows(params.type, height, H)) {
        buffer.setPixel(x, y, { ...color, a: alpha });
      }
    }
  }
}

// Which rows a bar of the given height occupies, per the manual's descriptions of each Type.
function barRows(type: MusicType, height: number, H: number): number[] {
  const rows: number[] = [];
  switch (type) {
    case "Separate": {
      // "Color bars starts in the middle and separates out."
      const mid = (H - 1) / 2;
      const reach = height / 2;
      for (let y = Math.ceil(mid - reach); y <= Math.floor(mid + reach); y++) if (y >= 0 && y < H) rows.push(y);
      break;
    }
    case "Collide": {
      // "starts at the outside and move inwards"
      const reach = Math.round(height / 2);
      for (let i = 0; i < reach; i++) {
        rows.push(i);
        rows.push(H - 1 - i);
      }
      break;
    }
    case "On":
      // "The bar comes on and fades away" - the whole column lights, the level is in its alpha.
      for (let y = 0; y < H; y++) rows.push(y);
      break;
    default:
      // Morph and Bounce both grow from the bottom; Bounce's difference is where it restarts
      // from, which is a property of the sequence over time rather than of one frame.
      for (let y = 0; y < height && y < H; y++) rows.push(y);
  }
  return rows;
}

function bandLevel(bands: number[], bar: number, barCount: number, logarithmic: boolean): number {
  // A linear split gives most of the buffer to frequencies music barely uses; the logarithmic
  // option is the manual's own fix - "better even out the auto waveform on the low frequency
  // end" - and matches how pitch is actually spaced.
  const t = barCount > 1 ? bar / (barCount - 1) : 0;
  const index = logarithmic
    ? Math.round((Math.pow(bands.length, t) - 1) / Math.max(1, bands.length - 1) * (bands.length - 1))
    : Math.round(t * (bands.length - 1));
  return bands[Math.max(0, Math.min(bands.length - 1, index))] ?? 0;
}

function barColor(palette: RGBA[], bar: number, barCount: number, mode: MusicColor, level: number): RGBA {
  if (palette.length === 0) return rgba(255, 255, 255, 255);
  if (mode === "Cycle") return palette[bar % palette.length]!;
  if (mode === "Blend") {
    // Blend runs the palette across the spectrum, so a bar's colour says which frequency it is.
    const t = barCount > 1 ? bar / (barCount - 1) : 0;
    const scaled = Math.min(0.999999, t) * (palette.length - 1);
    const i = Math.floor(scaled);
    const f = scaled - i;
    const a = palette[i]!;
    const b = palette[i + 1] ?? a;
    return rgba(
      Math.round(a.r + (b.r - a.r) * f),
      Math.round(a.g + (b.g - a.g) * f),
      Math.round(a.b + (b.b - a.b) * f),
      255,
    );
  }
  // Distinct: the palette entry is picked by how loud the band is, so colour reads as level.
  return palette[Math.min(palette.length - 1, Math.floor(level * palette.length))]!;
}

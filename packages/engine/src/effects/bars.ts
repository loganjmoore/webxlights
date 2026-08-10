import type { RGBA } from "../color";
import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { effectTimeIntervalPosition, type FrameContext } from "./types";

export type BarsDirection = "up" | "down" | "left" | "right" | "expand" | "compress" | "h-expand" | "h-compress";

export interface BarsParams {
  paletteRep: number; // 1-5
  cycles: number;
  direction: BarsDirection;
  centerPercent: number; // -100..100, only used by expand/compress/h-expand/h-compress
  highlight: boolean;
}

// ponytail: covers the 8 "moving/static-center" directions; the 4 Alternate-* (whole-bar
// snap) and 2 Custom-* (static offset) directions are a documented ceiling.
export function renderBars(buffer: RenderBuffer, palette: RGBA[], params: BarsParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const colorcnt = Math.max(1, palette.length);
  const barCount = Math.max(1, params.paletteRep * colorcnt);
  const position = effectTimeIntervalPosition(ctx.positionInEffect01, params.cycles);
  const vertical = params.direction === "up" || params.direction === "down" || params.direction === "expand" || params.direction === "compress";

  if (vertical) {
    const barHt = Math.max(1, Math.ceil(H / barCount));
    const blockHt = colorcnt * barHt;
    const newCenter = (H * (100 + params.centerPercent)) / 200;
    const fOffset = Math.floor(position * blockHt);

    for (let y = -2 * H; y < 2 * H; y++) {
      const n = H + y + fOffset;
      const colorIdx = Math.floor(Math.abs(n % blockHt) / barHt) % colorcnt;
      let color = palette[colorIdx] ?? rgba(0, 0, 0, 0);
      if (params.highlight && n % barHt === 0) color = rgba(255, 255, 255, 255);

      const plot = (px: number, py: number) => {
        if (px < 0 || px >= W || py < 0 || py >= H) return;
        buffer.setPixel(px, py, color);
      };

      if (params.direction === "up") {
        for (let x = 0; x < W; x++) plot(x, H - y - 1);
      } else if (params.direction === "down") {
        for (let x = 0; x < W; x++) plot(x, y);
      } else if (params.direction === "expand") {
        if (y <= newCenter) for (let x = 0; x < W; x++) { plot(x, y); plot(x, Math.round(2 * newCenter - y)); }
      } else if (params.direction === "compress") {
        if (y >= newCenter) for (let x = 0; x < W; x++) { plot(x, y); plot(x, Math.round(2 * newCenter - y)); }
      }
    }
  } else {
    const barWi = Math.max(1, Math.ceil(W / barCount));
    const blockWi = colorcnt * barWi;
    const newCenter = (W * (100 + params.centerPercent)) / 200;
    const fOffset = Math.floor(position * blockWi);

    for (let x = -2 * W; x < 2 * W; x++) {
      const n = W + x + fOffset;
      const colorIdx = (((n % blockWi) + blockWi) % blockWi) / barWi | 0;
      let color = palette[colorIdx % colorcnt] ?? rgba(0, 0, 0, 0);
      if (params.highlight && n % barWi === 0) color = rgba(255, 255, 255, 255);

      const plot = (px: number, py: number) => {
        if (px < 0 || px >= W || py < 0 || py >= H) return;
        buffer.setPixel(px, py, color);
      };

      if (params.direction === "left") {
        for (let y = 0; y < H; y++) plot(x, y);
      } else if (params.direction === "right") {
        for (let y = 0; y < H; y++) plot(W - x - 1, y);
      } else if (params.direction === "h-expand") {
        if (x <= newCenter) for (let y = 0; y < H; y++) { plot(x, y); plot(Math.round(2 * newCenter - x), y); }
      } else if (params.direction === "h-compress") {
        if (x >= newCenter) for (let y = 0; y < H; y++) { plot(x, y); plot(Math.round(2 * newCenter - x), y); }
      }
    }
  }
}

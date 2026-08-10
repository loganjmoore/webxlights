import type { RGBA } from "../color";
import { multiColorBlend } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { GLYPH_ADVANCE, GLYPH_HEIGHT, glyphPixel, measureText } from "./font5x7";
import type { FrameContext } from "./types";

export type TextMovement = "none" | "left" | "right" | "up" | "down";

export interface TextParams {
  text: string;
  scale: number; // 1-4, integer pixel scaling of the 5x7 cell
  movement: TextMovement;
  speed: number; // 0-50
  xOffsetPct: number; // -100..100 relative to centre
  yOffsetPct: number; // -100..100 relative to centre
  perCharacterColor: boolean; // step the palette per character instead of one colour
}

// SPEC ch8 "Text": rasterises a string into the buffer with optional scrolling. xLights renders
// system fonts via wxWidgets; the engine is DOM-free by design (DECISIONS.md - "testable in
// Node/Vitest"), so this uses the built-in 5x7 bitmap font instead. That's a documented ceiling:
// no font picker, no outline/shadow options, no per-line layout.
export function renderText(buffer: RenderBuffer, palette: RGBA[], params: TextParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  const text = params.text ?? "";
  if (W === 0 || H === 0 || text.length === 0) return;

  const scale = Math.max(1, Math.round(params.scale));
  const metrics = measureText(text);
  const pixelWidth = metrics.width * scale;
  const pixelHeight = GLYPH_HEIGHT * scale;

  // resting position: centred, then nudged by the offsets
  let originX = (W - pixelWidth) / 2 + (params.xOffsetPct / 100) * (W / 2);
  let originY = (H - pixelHeight) / 2 + (params.yOffsetPct / 100) * (H / 2);

  // scrolling travels one full "off one side to off the other" pass per effect, times Speed
  const travel = ctx.positionInEffect01 * Math.max(0, params.speed || 1);
  const pass = travel - Math.floor(travel);
  switch (params.movement) {
    case "left":
      originX = W - pass * (W + pixelWidth);
      break;
    case "right":
      originX = -pixelWidth + pass * (W + pixelWidth);
      break;
    case "down":
      originY = H - pass * (H + pixelHeight);
      break;
    case "up":
      originY = -pixelHeight + pass * (H + pixelHeight);
      break;
    case "none":
    default:
      break;
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const color = params.perCharacterColor
      ? multiColorBlend(palette, text.length > 1 ? i / text.length : 0, true)
      : (palette[0] ?? { r: 255, g: 255, b: 255, a: 255 });
    const charX = originX + i * GLYPH_ADVANCE * scale;
    if (charX + GLYPH_ADVANCE * scale < 0 || charX >= W) continue; // fully off-buffer

    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < 5; col++) {
        if (!glyphPixel(ch, col, row)) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = Math.round(charX + col * scale + sx);
            // glyph row 0 is the top row; the buffer's origin is bottom-left (SPEC ch4 §10)
            const py = Math.round(originY + (GLYPH_HEIGHT - 1 - row) * scale + sy);
            buffer.setPixel(px, py, color);
          }
        }
      }
    }
  }
}

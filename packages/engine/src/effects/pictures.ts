import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

// A decoded still image. The engine never touches the DOM (DECISIONS.md), so decoding happens
// in the browser (createImageBitmap -> canvas -> getImageData) and the raw RGBA rows arrive
// here as plain data - which also means an image round-trips through the sequence JSON and
// renders identically in a Node test.
export interface PictureImage {
  width: number;
  height: number;
  data: ArrayLike<number>; // RGBA, row-major, top row first
}

export type PictureMovement = "none" | "left" | "right" | "up" | "down" | "scaled";

export interface PicturesParams {
  image?: PictureImage;
  movement: PictureMovement;
  speed: number; // 0-50
  scaleMode: "none" | "stretch" | "fit";
  transparentBlack: boolean; // treat pure black as transparent rather than drawing it
  brightnessPct: number; // 0-100
}

// SPEC ch8 "Pictures": draw an image into the buffer, optionally scaled and scrolling.
export function renderPictures(buffer: RenderBuffer, _palette: RGBA[], params: PicturesParams, ctx: FrameContext): void {
  const image = params.image;
  const { width: W, height: H } = buffer;
  if (!image || image.width <= 0 || image.height <= 0 || W === 0 || H === 0) return;

  const travel = ctx.positionInEffect01 * Math.max(0, params.speed || 1);
  const pass = travel - Math.floor(travel);
  const brightness = Math.max(0, Math.min(1, params.brightnessPct / 100));

  // "scaled" movement zooms the image in and out instead of translating it
  const zoom = params.movement === "scaled" ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(2 * Math.PI * pass)) : 1;
  const { drawW, drawH } = fitSize(params.scaleMode, image, W, H, zoom);

  let originX = (W - drawW) / 2;
  let originY = (H - drawH) / 2;
  switch (params.movement) {
    case "left":
      originX = W - pass * (W + drawW);
      break;
    case "right":
      originX = -drawW + pass * (W + drawW);
      break;
    case "down":
      originY = H - pass * (H + drawH);
      break;
    case "up":
      originY = -drawH + pass * (H + drawH);
      break;
    default:
      break;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x - originX) / drawW;
      const v = (y - originY) / drawH;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;

      const sx = Math.min(image.width - 1, Math.floor(u * image.width));
      // buffer origin is bottom-left, image rows are top-first. Flip the *row index* rather
      // than the coordinate: `floor((1 - v) * height)` puts the exact half-way pixel on the
      // wrong side of the boundary, which shears the image by one source row.
      const sy = image.height - 1 - Math.min(image.height - 1, Math.floor(v * image.height));
      const i = (sy * image.width + sx) * 4;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      const a = image.data[i + 3] ?? 255;
      if (a === 0) continue;
      if (params.transparentBlack && r === 0 && g === 0 && b === 0) continue;

      buffer.setPixel(x, y, {
        r: Math.round(r * brightness),
        g: Math.round(g * brightness),
        b: Math.round(b * brightness),
        a,
      });
    }
  }
}

function fitSize(
  scaleMode: PicturesParams["scaleMode"],
  image: PictureImage,
  W: number,
  H: number,
  zoom: number,
): { drawW: number; drawH: number } {
  if (scaleMode === "stretch") return { drawW: W * zoom, drawH: H * zoom };
  if (scaleMode === "fit") {
    const factor = Math.min(W / image.width, H / image.height) * zoom;
    return { drawW: image.width * factor, drawH: image.height * factor };
  }
  return { drawW: image.width * zoom, drawH: image.height * zoom };
}

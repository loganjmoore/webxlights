import type { RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { PictureImage } from "./pictures";

// Drawing an image into a render buffer.
//
// Pulled out of the Pictures effect because Matrix faces need exactly the same thing: sample an
// image into a rectangle of the buffer, flipping between the image's top-first rows and the
// buffer's bottom-left origin. Two copies of that flip would be two chances to get it wrong in
// different directions, and the symptom - a picture that renders upside down on one effect and
// not the other - is the kind that gets blamed on the model rather than the code.

export interface ImageDrawOptions {
  /** Where the image's rectangle sits in the buffer, in buffer pixels. */
  originX: number;
  originY: number;
  drawW: number;
  drawH: number;
  /** 0..1, applied to the colour rather than the alpha, as the Pictures effect does. */
  brightness?: number;
  /** Treat pure black as transparent rather than drawing it. */
  transparentBlack?: boolean;
  /** 0..1, scales the source alpha - what a fade needs. */
  opacity?: number;
}

export function drawImageInto(buffer: RenderBuffer, image: PictureImage, options: ImageDrawOptions): void {
  const { originX, originY, drawW, drawH } = options;
  if (image.width <= 0 || image.height <= 0 || drawW <= 0 || drawH <= 0) return;

  const brightness = Math.max(0, Math.min(1, options.brightness ?? 1));
  const opacity = Math.max(0, Math.min(1, options.opacity ?? 1));

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
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
      if (options.transparentBlack && r === 0 && g === 0 && b === 0) continue;

      const pixel: RGBA = {
        r: Math.round(r * brightness),
        g: Math.round(g * brightness),
        b: Math.round(b * brightness),
        a: opacity >= 1 ? a : Math.round(a * opacity),
      };
      buffer.setPixel(x, y, pixel);
    }
  }
}

/**
 * The two placements a Matrix face definition offers.
 *
 * The manual: "'Center' will display the image in the center of the matrix. If the image
 * resolution is greater than the matrix resolution, xLights will down scale the image to the
 * matrix resolution. 'Scaled' will upscale the X and Y resolution of the image separately to the
 * matrix resolution."
 *
 * So Centered keeps the image's own aspect ratio and only ever shrinks; Scaled fills the buffer
 * and distorts if it has to.
 */
export function facePlacement(
  placement: "Centered" | "Scaled",
  image: PictureImage,
  W: number,
  H: number,
): { originX: number; originY: number; drawW: number; drawH: number } {
  if (placement === "Scaled") return { originX: 0, originY: 0, drawW: W, drawH: H };
  const factor = Math.min(1, Math.min(W / image.width, H / image.height));
  const drawW = image.width * factor;
  const drawH = image.height * factor;
  return { originX: (W - drawW) / 2, originY: (H - drawH) / 2, drawW, drawH };
}

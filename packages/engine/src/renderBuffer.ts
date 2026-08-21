import type { RGBA } from "./color";
import { rgba } from "./color";

// Origin bottom-left per SPEC ch4 §10 ("buffer coords bufX,bufY, 0-based, origin bottom-left").
export class RenderBuffer {
  readonly width: number;
  readonly height: number;
  private pixels: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  setPixel(x: number, y: number, c: RGBA): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.pixels[i] = c.r;
    this.pixels[i + 1] = c.g;
    this.pixels[i + 2] = c.b;
    this.pixels[i + 3] = c.a;
  }

  getPixel(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return rgba(this.pixels[i]!, this.pixels[i + 1]!, this.pixels[i + 2]!, this.pixels[i + 3]!);
  }

  /**
   * getPixel without the allocation: writes the channels into `out`.
   *
   * The compositor reads every pixel of every layer on every frame; getPixel's fresh object per
   * read made the garbage collector a measured 11% of a full render (the M9 bench profile), so
   * the per-frame path reads into one reused object instead.
   */
  readInto(x: number, y: number, out: RGBA): void {
    const i = (y * this.width + x) * 4;
    out.r = this.pixels[i]!;
    out.g = this.pixels[i + 1]!;
    out.b = this.pixels[i + 2]!;
    out.a = this.pixels[i + 3]!;
  }

  fill(c: RGBA): void {
    const px = this.pixels;
    px[0] = c.r;
    px[1] = c.g;
    px[2] = c.b;
    px[3] = c.a;
    // Doubling copyWithin fills the rest from what is already filled - O(log n) calls into the
    // runtime instead of a JS loop over every pixel.
    for (let filled = 4; filled < px.length; filled *= 2) {
      px.copyWithin(filled, 0, Math.min(filled, px.length - filled));
    }
  }

  /** Zeroes every pixel, so a scratch buffer can be reused instead of reallocated. */
  clear(): void {
    this.pixels.fill(0);
  }

  /** Copies another buffer of the same shape wholesale - the typed array does the work. */
  copyFrom(other: RenderBuffer): void {
    if (other.width !== this.width || other.height !== this.height) return;
    this.pixels.set(other.pixels);
  }
}

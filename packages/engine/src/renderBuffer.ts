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

  fill(c: RGBA): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.setPixel(x, y, c);
    }
  }
}

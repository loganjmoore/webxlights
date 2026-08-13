import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderPictures, type PictureImage, type PicturesParams } from "../src/effects/pictures";

const BASE: PicturesParams = {
  movement: "none",
  speed: 1,
  scaleMode: "fit",
  transparentBlack: false,
  brightnessPct: 100,
};

// 2x2: top-left red, top-right green, bottom-left blue, bottom-right black
const IMAGE: PictureImage = {
  width: 2,
  height: 2,
  data: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255],
};

function render(params: Partial<PicturesParams>, position01: number, w = 8, h = 8): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  renderPictures(buf, [rgba(255, 255, 255)], { ...BASE, image: IMAGE, ...params }, {
    frameIndexInEffect: 0,
    positionInEffect01: position01,
    seed: 1,
  });
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Pictures effect (SPEC ch8)", () => {
  it("renders nothing when no image has been chosen yet", () => {
    const buf = new RenderBuffer(8, 8);
    renderPictures(buf, [], { ...BASE }, { frameIndexInEffect: 0, positionInEffect01: 0, seed: 1 });
    expect(litCount(buf)).toBe(0);
  });

  it("flips image rows so the picture isn't upside down in a bottom-left-origin buffer", () => {
    const buf = render({ scaleMode: "stretch" }, 0);
    // image top-left is red -> buffer top-left
    expect(buf.getPixel(1, 7)).toMatchObject({ r: 255, g: 0, b: 0 });
    // image bottom-left is blue -> buffer bottom-left
    expect(buf.getPixel(1, 0)).toMatchObject({ r: 0, g: 0, b: 255 });
  });

  it("stretch fills the whole buffer", () => {
    expect(litCount(render({ scaleMode: "stretch" }, 0))).toBe(64);
  });

  it("fit preserves the image's aspect ratio", () => {
    // a 2x2 image fitted into 8x4 covers a 4x4 square, not the full 8x4
    expect(litCount(render({ scaleMode: "fit" }, 0, 8, 4))).toBe(16);
  });

  it("black is drawn by default and skipped when Black is Transparent is on", () => {
    expect(litCount(render({ scaleMode: "stretch", transparentBlack: false }, 0))).toBe(64);
    expect(litCount(render({ scaleMode: "stretch", transparentBlack: true }, 0))).toBe(48); // one quadrant dropped
  });

  it("brightness scales the drawn colours", () => {
    const full = render({ scaleMode: "stretch", brightnessPct: 100 }, 0).getPixel(1, 7);
    const half = render({ scaleMode: "stretch", brightnessPct: 50 }, 0).getPixel(1, 7);
    expect(half.r).toBeLessThan(full.r);
    expect(half.a).toBe(full.a); // brightness dims colour, it doesn't make it transparent
  });

  it("scrolls across the buffer over the effect", () => {
    const a = render({ movement: "left", speed: 1 }, 0.1);
    const b = render({ movement: "left", speed: 1 }, 0.4);
    let differences = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (a.getPixel(x, y).a !== b.getPixel(x, y).a) differences++;
    expect(differences).toBeGreaterThan(0);
  });

  it("scaled movement zooms rather than translating", () => {
    const small = litCount(render({ movement: "scaled", scaleMode: "stretch", speed: 1 }, 0.75));
    const large = litCount(render({ movement: "scaled", scaleMode: "stretch", speed: 1 }, 0.25));
    expect(large).toBeGreaterThan(small);
  });

  it("a fully transparent source pixel is skipped", () => {
    const withAlpha: PictureImage = { width: 1, height: 1, data: [255, 0, 0, 0] };
    const buf = new RenderBuffer(4, 4);
    renderPictures(buf, [], { ...BASE, image: withAlpha, scaleMode: "stretch" }, {
      frameIndexInEffect: 0,
      positionInEffect01: 0,
      seed: 1,
    });
    expect(litCount(buf)).toBe(0);
  });
});

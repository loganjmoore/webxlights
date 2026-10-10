import { describe, expect, it } from "vitest";
import { decodePictureData, encodePictureData } from "../src/lib/pictureData";
import { heardSinging } from "../src/lib/lyricAlign";

describe("a drawn picture kept inside its effect", () => {
  it("keeps its colours and turns near-black off", () => {
    // 3x2: red, green, near-black / blue, off (transparent), red again.
    const rgba = [250, 10, 10, 255, 20, 200, 30, 255, 12, 9, 15, 255, 10, 30, 240, 255, 0, 0, 0, 0, 252, 12, 8, 255];
    const data = encodePictureData(3, 2, rgba);
    const image = decodePictureData(data)!;
    expect([image.width, image.height]).toEqual([3, 2]);
    const pixel = (i: number) => Array.from(image.data).slice(i * 4, i * 4 + 4);
    // The two reds share a colour; each keeps close to what it was.
    expect(pixel(0)).toEqual(pixel(5));
    for (const [i, rgb] of [[0, [250, 10, 10]], [1, [20, 200, 30]], [3, [10, 30, 240]]] as const) {
      pixel(i).slice(0, 3).forEach((v, k) => expect(Math.abs(v - rgb[k]!)).toBeLessThanOrEqual(4));
      expect(pixel(i)[3]).toBe(255);
    }
    expect(pixel(2)[3]).toBe(0);
    expect(pixel(4)[3]).toBe(0);
    // Small enough to live in the sequence: a 64x64 drawing is a few KB.
    const big = encodePictureData(64, 64, Array.from({ length: 64 * 64 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256)));
    expect(big.length).toBeLessThan(7000);
  });

  it("is not opened from anything else", () => {
    expect(decodePictureData("not a picture")).toBeUndefined();
    expect(decodePictureData("pd1|9999|9999||AA==")).toBeUndefined();
  });
});

describe("hearing singing", () => {
  const at = (texts: string[], everyS: number) => texts.map((text, i) => ({ text, start: i * everyS, end: i * everyS + 0.4 }));

  it("takes a handful of filler words across an instrumental for no singing", () => {
    expect(heardSinging(at(Array.from({ length: 18 }, (_, i) => (i % 2 ? "Music" : "Thank you.")), 7), 131_000)).toBe(false);
  });

  it("takes lines of different words for singing", () => {
    const words = "the little red sleigh goes over the hill and down to the town where the lights are on".split(" ");
    expect(heardSinging(at([...words, ...words], 1), 60_000)).toBe(true);
  });
});

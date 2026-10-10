import type { PictureImage } from "@webxlights/engine";

// A picture small enough to live inside its effect: a drawing made for the matrix (an image
// model's, magic/drawnPictures.ts) shrunk to 64 pixels and reduced to at most 63 colours, kept as
// one string param, "pd1|width|height|palette|indices". About 6KB where the plain RGBA would be
// 50KB of JSON, and it renders anywhere the sequence does (preview, export, a Node test) with
// nothing to fetch. Index 0 is off; near-black counts as off, since a matrix shows black as dark
// and an image model's "pure black" background is rarely exactly 0.

const PREFIX = "pd1";
const MAX_COLOURS = 63;
/** Brightest channel below this is off. */
const OFF = 28;

export function encodePictureData(width: number, height: number, rgba: ArrayLike<number>): string {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const bucketOf = (i: number) => ((rgba[i]! >> 4) << 8) | ((rgba[i + 1]! >> 4) << 4) | (rgba[i + 2]! >> 4);
  const off = (i: number) => (rgba[i + 3] ?? 255) < 128 || Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) < OFF;
  for (let i = 0; i < width * height * 4; i += 4) {
    if (off(i)) continue;
    const k = bucketOf(i);
    const c = counts.get(k) ?? counts.set(k, { n: 0, r: 0, g: 0, b: 0 }).get(k)!;
    c.n++; c.r += rgba[i]!; c.g += rgba[i + 1]!; c.b += rgba[i + 2]!;
  }
  // The commonest colours, each the average of what fell into its bucket.
  const palette = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX_COLOURS)
    .map(([k, c]) => ({ k, rgb: [c.r / c.n, c.g / c.n, c.b / c.n].map(Math.round) as [number, number, number] }));
  const indexOfBucket = new Map(palette.map((p, i) => [p.k, i + 1]));
  const nearest = (i: number) => {
    let best = 1, bestD = Infinity;
    palette.forEach((p, j) => {
      const d = (p.rgb[0] - rgba[i]!) ** 2 + (p.rgb[1] - rgba[i + 1]!) ** 2 + (p.rgb[2] - rgba[i + 2]!) ** 2;
      if (d < bestD) { bestD = d; best = j + 1; }
    });
    return best;
  };
  let bytes = "";
  for (let i = 0; i < width * height * 4; i += 4) bytes += String.fromCharCode(off(i) || !palette.length ? 0 : indexOfBucket.get(bucketOf(i)) ?? nearest(i));
  const hex = palette.map((p) => p.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")).join(",");
  return [PREFIX, width, height, hex, btoa(bytes)].join("|");
}

const decoded = new Map<string, PictureImage>();

/** The image a picture string holds, decoded once; undefined when it is not one. */
export function decodePictureData(data: string): PictureImage | undefined {
  const cached = decoded.get(data);
  if (cached) return cached;
  const [prefix, w, h, hex, indices] = data.split("|");
  const width = Number(w), height = Number(h);
  if (prefix !== PREFIX || !(width > 0 && height > 0 && width * height <= 128 * 128) || indices === undefined) return undefined;
  const palette = (hex ? hex.split(",") : []).map((c) => [0, 2, 4].map((o) => parseInt(c.slice(o, o + 2), 16)));
  const bytes = atob(indices);
  const out: number[] = new Array(width * height * 4).fill(0);
  for (let p = 0; p < width * height; p++) {
    const c = palette[bytes.charCodeAt(p) - 1];
    if (c) { out[p * 4] = c[0]!; out[p * 4 + 1] = c[1]!; out[p * 4 + 2] = c[2]!; out[p * 4 + 3] = 255; }
  }
  // ponytail: an unbounded cache would grow with every drawing seen in a session; 64 is plenty.
  if (decoded.size >= 64) decoded.clear();
  const image = { width, height, data: out };
  decoded.set(data, image);
  return image;
}

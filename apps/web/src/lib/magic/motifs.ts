import type { PictureImage } from "@webxlights/engine";

// Pictures for a matrix: small motifs drawn from shapes in the section's own colours, so an image
// belongs to the look it plays in. Pure and DOM-free, like the rest of the choreographer, so the
// same song and plan always draw the same pixels.

export type Motif = "star" | "tree" | "snowflake" | "bell" | "heart" | "candycane" | "gift" | "note" | "cross" | "pumpkin" | "ornament";

/** Inside the shape, in a 0..1 square with y down. */
type Shape = (x: number, y: number) => boolean;
/** A colour slot (0 base, 1 second, 2 accent) or a hole, -1. */
type Layer = [slot: number | ((x: number, y: number) => number), shape: Shape];

const circle = (cx: number, cy: number, r: number): Shape => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const both = (a: Shape, b: Shape): Shape => (x, y) => a(x, y) && b(x, y);
const poly = (points: [number, number][]): Shape => (x, y) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const line = (x0: number, y0: number, x1: number, y1: number, w: number): Shape => (x, y) => {
  const dx = x1 - x0, dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
  return (x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2 <= (w / 2) ** 2;
};
const star = (cx: number, cy: number, outer: number, inner: number): Shape =>
  poly(Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? inner : outer;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  }));
const spokes = (cx: number, cy: number, n: number, from: number, to: number, w: number, turn = 0): Shape[] =>
  Array.from({ length: n }, (_, i) => {
    const a = turn + (i * 2 * Math.PI) / n;
    return line(cx + from * Math.cos(a), cy + from * Math.sin(a), cx + to * Math.cos(a), cy + to * Math.sin(a), w);
  });

const MOTIFS: Record<Motif, Layer[]> = {
  star: [[0, star(0.5, 0.53, 0.47, 0.19)], [2, star(0.5, 0.53, 0.2, 0.08)]],
  tree: [
    [0, poly([[0.5, 0.1], [0.84, 0.8], [0.16, 0.8]])],
    [1, rect(0.43, 0.8, 0.57, 0.94)],
    [2, circle(0.4, 0.56, 0.045)], [2, circle(0.6, 0.46, 0.045)], [2, circle(0.56, 0.68, 0.045)], [2, circle(0.33, 0.72, 0.045)],
    [2, star(0.5, 0.12, 0.12, 0.05)],
  ],
  snowflake: [
    ...spokes(0.5, 0.5, 6, 0, 0.46, 0.07, -Math.PI / 2).map((s): Layer => [0, s]),
    ...[0, 1, 2, 3, 4, 5].flatMap((i): Layer[] => {
      const a = -Math.PI / 2 + (i * Math.PI) / 3, bx = 0.5 + 0.28 * Math.cos(a), by = 0.5 + 0.28 * Math.sin(a);
      return [-1, 1].map((side): Layer => [0, line(bx, by, bx + 0.13 * Math.cos(a + side * 0.8), by + 0.13 * Math.sin(a + side * 0.8), 0.06)]);
    }),
    [1, circle(0.5, 0.5, 0.09)],
  ],
  bell: [
    [1, circle(0.5, 0.11, 0.05)],
    [0, circle(0.5, 0.36, 0.2)],
    [0, poly([[0.3, 0.36], [0.7, 0.36], [0.84, 0.76], [0.16, 0.76]])],
    [1, rect(0.13, 0.72, 0.87, 0.8)],
    [2, circle(0.5, 0.87, 0.075)],
  ],
  heart: [
    [0, circle(0.33, 0.37, 0.2)], [0, circle(0.67, 0.37, 0.2)],
    [0, poly([[0.15, 0.45], [0.85, 0.45], [0.5, 0.9]])],
    [2, circle(0.3, 0.32, 0.06)],
  ],
  // Stripes run across the cane: slot by diagonal band.
  candycane: [[(x, y) => (Math.floor((x + y) * 7) % 2 ? 2 : 0), (x, y) =>
    line(0.6, 0.32, 0.6, 0.94, 0.14)(x, y) || (y <= 0.32 && circle(0.42, 0.32, 0.25)(x, y) && !circle(0.42, 0.32, 0.11)(x, y)) || line(0.24, 0.32, 0.24, 0.44, 0.14)(x, y)]],
  gift: [
    [0, rect(0.17, 0.42, 0.83, 0.9)], [0, rect(0.12, 0.31, 0.88, 0.43)],
    [1, rect(0.45, 0.31, 0.55, 0.9)], [1, rect(0.17, 0.6, 0.83, 0.68)],
    [1, circle(0.39, 0.23, 0.09)], [1, circle(0.61, 0.23, 0.09)], [2, circle(0.5, 0.27, 0.05)],
  ],
  note: [
    [1, poly([[0.38, 0.18], [0.86, 0.1], [0.86, 0.22], [0.38, 0.3]])],
    [0, line(0.42, 0.24, 0.42, 0.76, 0.06)], [0, line(0.82, 0.16, 0.82, 0.68, 0.06)],
    [0, circle(0.32, 0.77, 0.12)], [0, circle(0.72, 0.69, 0.12)],
  ],
  cross: [
    ...spokes(0.5, 0.36, 12, 0.12, 0.48, 0.03).map((s): Layer => [1, s]),
    [0, rect(0.43, 0.08, 0.57, 0.92)], [0, rect(0.2, 0.29, 0.8, 0.43)],
  ],
  pumpkin: [
    [0, circle(0.33, 0.6, 0.25)], [0, circle(0.67, 0.6, 0.25)], [0, circle(0.5, 0.58, 0.28)],
    [1, rect(0.45, 0.16, 0.55, 0.34)],
    [-1, poly([[0.28, 0.56], [0.42, 0.56], [0.35, 0.44]])], [-1, poly([[0.58, 0.56], [0.72, 0.56], [0.65, 0.44]])],
    [-1, both(circle(0.5, 0.6, 0.2), rect(0, 0.68, 1, 1))],
  ],
  ornament: [
    [1, rect(0.42, 0.14, 0.58, 0.25)],
    [0, circle(0.5, 0.58, 0.34)],
    [2, both(circle(0.5, 0.58, 0.34), rect(0, 0.5, 1, 0.62))],
    [2, circle(0.38, 0.45, 0.05)],
  ],
};

/** Titles that name a motif, checked in order: "O Holy Night" is a star before it is a hymn. */
const TITLE_MOTIFS: [RegExp, Motif][] = [
  [/\bbells?\b|jingle|\bring/i, "bell"],
  [/\bstars?\b|night|bethlehem|wise men|twinkle|noel/i, "star"],
  [/snow|winter|frost|\bice\b|let it go/i, "snowflake"],
  [/\btree|tannenbaum|evergreen/i, "tree"],
  [/candy|peppermint/i, "candycane"],
  [/gift|present|santa|claus|\btoy|stocking|sleigh/i, "gift"],
  [/love|heart|valentine/i, "heart"],
  [/\bgod\b|jesus|\blord|\bchrist\b|holy|hallelujah|grace|praise|glory|worship|saviou?r|amen/i, "cross"],
  [/halloween|pumpkin|spooky|ghost|monster|thriller|witch/i, "pumpkin"],
  [/music|song|sing|rock|dance|party|drum/i, "note"],
];

/** The song's motifs: what its title names first, then the feel's own. */
export function songMotifs(title: string | undefined, feelMotifs: readonly Motif[]): Motif[] {
  const named = TITLE_MOTIFS.filter(([re]) => re.test(title ?? "")).map(([, m]) => m);
  return [...new Set([...named.slice(0, 2), ...feelMotifs])].slice(0, 3);
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * A motif as a Pictures image, size x size, in `colours` (base, second, accent). Edges are 3x3
 * supersampled into alpha; the background is transparent.
 */
export function drawMotif(motif: Motif, colours: readonly string[], size = 32): PictureImage {
  const layers = MOTIFS[motif];
  const rgb = [0, 1, 2].map((i) => hexRgb(colours[i] ?? colours[colours.length - 1] ?? "#ffffff"));
  const data: number[] = new Array(size * size * 4).fill(0);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
          let slot = -1;
          for (const [s, shape] of layers) if (shape(x, y)) slot = typeof s === "function" ? s(x, y) : s;
          if (slot < 0) continue;
          const c = rgb[slot]!;
          r += c[0]; g += c[1]; b += c[2]; hits++;
        }
      }
      if (!hits) continue;
      const i = (py * size + px) * 4;
      data[i] = Math.round(r / hits);
      data[i + 1] = Math.round(g / hits);
      data[i + 2] = Math.round(b / hits);
      data[i + 3] = Math.round((255 * hits) / (SS * SS));
    }
  }
  return { width: size, height: size, data };
}

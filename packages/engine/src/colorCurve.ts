import { rgba, type RGBA } from "./color";

// xLights' Color Curves (manual: Sequencer > Changing an effect > Color settings). A palette
// swatch normally holds one colour for the whole effect; a colour curve lets that swatch *change*
// - "where previously the same color value would have been displayed for a particular segment
// duration it can now be made to change within that segment duration".
//
// The manual splits them in two, and they are genuinely different mechanisms:
//
//   - **Time based**: "will change color over the duration of the effect". Resolvable once per
//     frame, before any effect runs, so all 43 effects gain it without knowing it exists - the
//     same trick value curves use for numeric params.
//   - **Spatial**: "will change over the models X/Y location. A spatial color curve has
//     direction." This one can't be resolved per frame, because within a single frame the swatch
//     is a different colour in different places. See sampleCountFor / renderFrame.ts for how it
//     is handled without every effect having to become position-aware.

export type ColorCurveMode = "Time" | "Spatial";
export type ColorCurveBlend = "Gradient" | "None";
export type ColorCurveDirection = "Left to Right" | "Right to Left" | "Bottom to Top" | "Top to Bottom";

export const COLOR_CURVE_DIRECTIONS: ColorCurveDirection[] = [
  "Left to Right",
  "Right to Left",
  "Bottom to Top",
  "Top to Bottom",
];

export interface ColorCurvePoint {
  /** 0..1 along the effect (Time) or across the model (Spatial). */
  x: number;
  /** "#rrggbb". Stored as hex because that is what the sequence body holds. */
  color: string;
}

export interface ColorCurve {
  kind: "colorCurve";
  mode: ColorCurveMode;
  /** "Gradient" blends between the markers; "None" gives a sharp change at each one. */
  blend: ColorCurveBlend;
  direction?: ColorCurveDirection;
  /** The manual's own ceiling is "up to 40 different color changes". */
  points: ColorCurvePoint[];
}

/** A palette swatch: a plain colour, or one that changes. */
export type PaletteEntry = RGBA | ColorCurve;

export const MAX_COLOR_CURVE_POINTS = 40;

export function isColorCurve(entry: unknown): entry is ColorCurve {
  return typeof entry === "object" && entry !== null && (entry as ColorCurve).kind === "colorCurve";
}

export function hexToRgbaColor(hex: string): RGBA {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return rgba(255, 255, 255, 255);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
}

/**
 * The colour a curve holds at position `t` (0..1).
 *
 * With "Gradient" the markers are interpolated; with "None" the colour holds until the next
 * marker, which is the sharp change the manual describes. Points are sorted here rather than
 * assumed sorted, because an editor that lets a marker be dragged past its neighbour would
 * otherwise produce a curve that runs backwards through part of its range.
 */
export function colorCurveAt(curve: ColorCurve, t: number): RGBA {
  const points = [...curve.points].sort((a, b) => a.x - b.x);
  if (points.length === 0) return rgba(255, 255, 255, 255);
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));

  if (clamped <= points[0]!.x) return hexToRgbaColor(points[0]!.color);
  const last = points[points.length - 1]!;
  if (clamped >= last.x) return hexToRgbaColor(last.color);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (clamped < a.x || clamped > b.x) continue;
    if (curve.blend === "None") return hexToRgbaColor(a.color);
    const span = b.x - a.x;
    const f = span <= 0 ? 0 : (clamped - a.x) / span;
    const from = hexToRgbaColor(a.color);
    const to = hexToRgbaColor(b.color);
    return rgba(
      Math.round(from.r + (to.r - from.r) * f),
      Math.round(from.g + (to.g - from.g) * f),
      Math.round(from.b + (to.b - from.b) * f),
      255,
    );
  }
  return hexToRgbaColor(last.color);
}

/**
 * Collapses a palette to plain colours for a given moment and position.
 *
 * Time curves read `position01`; spatial ones read `across01`. Passing the same value for both is
 * correct for a time-only palette and is what the per-frame path does.
 */
export function resolvePalette(palette: PaletteEntry[], position01: number, across01 = 0): RGBA[] {
  return palette.map((entry) =>
    isColorCurve(entry) ? colorCurveAt(entry, entry.mode === "Spatial" ? across01 : position01) : entry,
  );
}

/** Whether any swatch changes across the model rather than over time. */
export function hasSpatialCurve(palette: PaletteEntry[]): boolean {
  return palette.some((entry) => isColorCurve(entry) && entry.mode === "Spatial");
}

/**
 * The direction a palette's spatial curves run in, and whether they blend.
 *
 * Several swatches could in principle disagree; the first spatial one wins, because a buffer can
 * only be sampled along one axis at a time and silently rendering half the palette along the
 * wrong axis would be worse than picking one.
 */
export function spatialAxisFor(palette: PaletteEntry[]): { direction: ColorCurveDirection; blend: ColorCurveBlend } {
  for (const entry of palette) {
    if (isColorCurve(entry) && entry.mode === "Spatial") {
      return { direction: entry.direction ?? "Left to Right", blend: entry.blend };
    }
  }
  return { direction: "Left to Right", blend: "Gradient" };
}

/** How far along the spatial axis a buffer cell sits, 0..1. */
export function acrossAt(
  direction: ColorCurveDirection,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const fx = width > 1 ? x / (width - 1) : 0;
  const fy = height > 1 ? y / (height - 1) : 0;
  switch (direction) {
    case "Right to Left":
      return 1 - fx;
    case "Bottom to Top":
      return fy;
    case "Top to Bottom":
      return 1 - fy;
    default:
      return fx;
  }
}

/**
 * How many times a spatial-curve layer has to be rendered.
 *
 * A spatial curve makes a swatch a different colour in different places *within one frame*, so it
 * can't be collapsed before the effect runs the way a time curve can. Making all 43 effects
 * position-aware instead is not an option worth taking for one feature.
 *
 * So the effect is rendered a handful of times, each with the palette resolved at a different
 * point along the axis, and each destination pixel is taken from (or blended between) the renders
 * nearest its own position. That is exact for any effect whose output is linear in its palette,
 * which is nearly all of them - an effect picks a swatch and scales it - and a close approximation
 * for the rest.
 *
 * Eight samples is the cap: the cost is paid per sample, and past eight the difference between
 * neighbouring samples is smaller than a step in an 8-bit channel for any realistic curve.
 */
export function sampleCountFor(palette: PaletteEntry[]): number {
  if (!hasSpatialCurve(palette)) return 1;
  const markers = palette.reduce(
    (most, entry) => (isColorCurve(entry) && entry.mode === "Spatial" ? Math.max(most, entry.points.length) : most),
    2,
  );
  return Math.max(2, Math.min(MAX_SPATIAL_SAMPLES, markers));
}

export const MAX_SPATIAL_SAMPLES = 8;

/** A stored swatch, as the sequence body holds it: a hex string, or a curve. */
export type StoredSwatch = string | ColorCurve;

/**
 * Turns a sequence's stored palette into one the renderer can use.
 *
 * One function rather than a `.map(hexToRgba)` at each call site, because there are five of them
 * (preview, popped-out preview, group rows, sub-model rows, export) and a swatch that a colour
 * curve reached would otherwise be silently parsed as a hex string - `parseInt` on an object
 * gives NaN, which is white. A palette that quietly turns white is exactly the kind of failure
 * that reaches the yard.
 */
export function toRenderPalette(palette: StoredSwatch[] | undefined): PaletteEntry[] | undefined {
  return palette?.map((entry) => (isColorCurve(entry) ? entry : hexToRgbaColor(entry)));
}

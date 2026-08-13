import { computeGeometryFromAttrs } from "./fromAttrs";
import { appliedPlacementFor, screenFromAttrs, type BoxedScaleReading } from "./placement";
import { transformedHalfExtents } from "./transform";
import type { ModelGeometry } from "./types";

// Picks how to read a boxed model's ScaleX for a given show, from evidence inside that show.
//
// The problem: xLights' documentation says only "ScaleXYZ determine the size of the model",
// which doesn't distinguish "ScaleX multiplies a node-unit render size" from "ScaleX is the
// world width". Those differ by a factor of the model's node count - so on a 32-wide matrix
// they differ by 32x. Guess wrong and one prop swallows the yard: every other model is drawn
// correctly but at a thirtieth of the scale, which reads as "the import scrambled my layout".
//
// The way out is that a show contains its own answer, in two independent pieces of evidence.
//
// The first is decisive when it fires: a prop cannot be bigger than the yard it stands in. The
// spread of the models' own WorldPos values says how big the yard is, and that spread doesn't
// depend on the boxed reading at all. A reading that makes some model wider than the entire
// layout is describing something physically impossible, and the other reading wins outright.
//
// The second settles the rest. Two-point, three-point and poly-line models are sized by data
// that is unambiguously in world units - the X2/Y2 offset between their endpoints, or the
// vertex list in PointData - so they can be measured without knowing the boxed reading. In a
// real yard props are broadly comparable: a mega tree and a roofline are within a small factor
// of each other. Whichever reading puts the boxed models in the same size league as those wins.
//
// Medians, not means, for that second test: one enormous matrix or one tiny wreath shouldn't
// decide it. A show that offers neither piece of evidence keeps the existing behaviour rather
// than having a yardstick invented for it.

const READINGS: BoxedScaleReading[] = ["perNode", "worldSize"];

export interface BoxedScaleChoice {
  reading: BoxedScaleReading;
  /** How many models were measurable on each side of the comparison. */
  referenceCount: number;
  boxedCount: number;
  /** Median world width of the endpoint-placed models, and of the boxed ones under each reading. */
  referenceMedian: number;
  widthByReading: Record<BoxedScaleReading, number>;
  /** How far apart the models' own positions are - the size of the yard. */
  yardSpan: number;
  /** Which evidence settled it, for the import banner and for diagnosing a wrong call. */
  reason: "impossible-size" | "closest-to-measured" | "no-evidence";
  /** False when there was nothing to compare against and the default was kept. */
  decided: boolean;
}

export interface PlaceableModel {
  displayAs: string;
  attrs: Record<string, string>;
}

function geometryOf(displayAs: string, attrs: Record<string, string>): ModelGeometry | null {
  try {
    return computeGeometryFromAttrs(displayAs, attrs);
  } catch {
    return null;
  }
}

// What a model actually occupies on the canvas once placed - the same number the renderers and
// hit-testing use, so the comparison is against what someone would see rather than against a
// raw attribute.
function renderedWidth(
  model: PlaceableModel,
  geo: ModelGeometry,
  unitsPerLocal: number,
  reading: BoxedScaleReading,
): number {
  const screen = screenFromAttrs(model.displayAs, model.attrs, geo, unitsPerLocal, reading);
  const half = transformedHalfExtents(geo, {
    scale: screen.scale,
    scaleY: screen.scaleY,
    scaleZ: screen.scaleZ,
    rotateDeg: screen.rotate,
  });
  return half.halfW * 2 * unitsPerLocal;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function chooseBoxedScaleReading(models: PlaceableModel[], unitsPerLocal: number): BoxedScaleChoice {
  const referenceWidths: number[] = [];
  const boxedWidths: Record<BoxedScaleReading, number[]> = { perNode: [], worldSize: [] };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const model of models) {
    const geo = geometryOf(model.displayAs, model.attrs);
    if (!geo || geo.nodes.length === 0) continue;

    // Every placement system puts the anchor somewhere that doesn't depend on the boxed
    // reading - WorldPos for a boxed model, the midpoint of the endpoints otherwise - so the
    // spread of anchors is a measure of the yard that neither reading can bias.
    const anchor = screenFromAttrs(model.displayAs, model.attrs, geo, unitsPerLocal, "perNode");
    minX = Math.min(minX, anchor.x);
    maxX = Math.max(maxX, anchor.x);
    minY = Math.min(minY, anchor.y);
    maxY = Math.max(maxY, anchor.y);

    if (appliedPlacementFor(model.displayAs, model.attrs) === "boxed") {
      for (const reading of READINGS) {
        const width = renderedWidth(model, geo, unitsPerLocal, reading);
        if (width > 0 && Number.isFinite(width)) boxedWidths[reading].push(width);
      }
    } else {
      // Sized by endpoints or vertices, so its width is the same under either reading.
      const width = renderedWidth(model, geo, unitsPerLocal, "perNode");
      if (width > 0 && Number.isFinite(width)) referenceWidths.push(width);
    }
  }

  const referenceMedian = median(referenceWidths);
  const widthByReading = {
    perNode: median(boxedWidths.perNode),
    worldSize: median(boxedWidths.worldSize),
  };
  const positionSpan = Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY) : 0;
  // The yard is at least as big as the spread of positions, and at least as big as the longest
  // thing we can already measure - a single roofline show has no spread but is not tiny.
  const yardSpan = Math.max(positionSpan, ...referenceWidths, 0);

  const base: BoxedScaleChoice = {
    reading: "perNode",
    referenceCount: referenceWidths.length,
    boxedCount: boxedWidths.perNode.length,
    referenceMedian,
    widthByReading,
    yardSpan,
    reason: "no-evidence",
    decided: false,
  };
  if (boxedWidths.perNode.length === 0) return base;

  // First test, and the decisive one when it fires: a prop cannot be bigger than the yard it
  // stands in. Compared on the widest boxed model, because it's the one that gives the game
  // away - a matrix three times the width of the whole layout is not a matrix.
  if (yardSpan > 0) {
    const possible = READINGS.filter((reading) => Math.max(...boxedWidths[reading]) <= yardSpan);
    if (possible.length === 1) {
      return { ...base, reading: possible[0]!, reason: "impossible-size", decided: true };
    }
  }

  // Otherwise fall back to which reading puts the boxed models nearest in size to the ones
  // measured from their endpoints. Compared in log space, so "eight times too big" and "eight
  // times too small" count the same - a plain difference would always prefer the smaller one.
  if (referenceWidths.length === 0 || referenceMedian <= 0) return base;

  let best: BoxedScaleReading = "perNode";
  let bestError = Infinity;
  for (const reading of READINGS) {
    const width = widthByReading[reading];
    if (width <= 0) continue;
    const error = Math.abs(Math.log(width / referenceMedian));
    if (error < bestError) {
      bestError = error;
      best = reading;
    }
  }

  return { ...base, reading: best, reason: "closest-to-measured", decided: true };
}

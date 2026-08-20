import { resolveDisplayAs, type ScreenTransform } from "@webxlights/engine";
import type { ModelRecord } from "./api";

// One definition of a model's screen transform, for every view that draws one.
//
// The 3D layout canvas and the house preview each built their own, which is how they came to
// disagree - at one point the layout canvas was passing no depth scale and no X/Y rotation while
// the preview passed both, so the same model was a different shape depending on which window you
// were looking at.

/**
 * Model types that only ever stand upright.
 *
 * Two of the three rotations can tip a model over. Z spins it in its own face plane, X pitches it
 * forwards and backwards; either at 180 degrees stands it on its head. Only Y turns it about its
 * own vertical axis, which for a tree is the one rotation that means anything - it decides which
 * strand faces the street.
 *
 * So X and Z are dropped for these, and Y is kept. It is a deliberate override of what the file
 * says, in the same spirit as taking the magnitude of a negative scale (models/transform.ts) and
 * ignoring the sign of a tree's bottom/top ratio (models/tree.ts): all of them are cases where a
 * stored value would stand a prop on its head, and nobody's yard has an upside-down mega tree.
 *
 * Dropping Z alone was not enough, and the gap is worth recording because the reasoning above was
 * already written down when only Z was being dropped. A layout imported before X and Y rotations
 * were read at all had no X to apply, so trees looked right; re-importing the same show brought
 * the file's RotateX back and stood them on their heads again. A rule that names one axis when it
 * means two survives exactly until the other one appears in the data.
 */
const UPRIGHT_ONLY = new Set(["Tree"]);

/**
 * Model types that stand on the ground.
 *
 * A mega tree's base is on the lawn - that is what a mega tree is. Its stored position is its
 * *centre* (models/transform.ts), so how high the centre has to be depends on how tall we draw
 * it, and that changed the moment strand folding made a tree a quarter of its old height. A
 * position that was right for the old geometry leaves the same tree hanging in the air.
 *
 * Planting it removes the dependency: whatever the geometry works out to, the base sits on the
 * ground. Deliberately not every model - a star on a roof peak and lights along a gutter are
 * placed where they are on purpose, and dropping them to the lawn would be worse than leaving
 * them alone.
 */
const GROUND_STANDING = new Set(["Tree"]);

export function standsOnGround(model: ModelRecord): boolean {
  return GROUND_STANDING.has(resolveDisplayAs(model.raw_attrs?.DisplayAs ?? model.type).type);
}

/**
 * The Y a model is drawn at, given how tall it turned out to be.
 *
 * Applied at draw time rather than written back, so nothing rewrites a position somebody set. The
 * pick box uses the same answer, which is what stops a model jumping the moment it is grabbed.
 */
export function displayY(model: ModelRecord, halfHeightWorld: number, groundY: number, keepOnGround: boolean): number {
  const stored = model.screen.y ?? 0;
  if (!keepOnGround || !standsOnGround(model)) return stored;
  return groundY + halfHeightWorld;
}

export function transformForModel(model: ModelRecord): ScreenTransform {
  const { type } = resolveDisplayAs(model.raw_attrs?.DisplayAs ?? model.type);
  const rotate = model.screen.rotate ?? 0;
  return {
    scale: model.screen.scale ?? 1,
    scaleY: model.screen.scaleY,
    scaleZ: model.screen.scaleZ,
    rotateDeg: UPRIGHT_ONLY.has(type) ? 0 : rotate,
    rotateXDeg: UPRIGHT_ONLY.has(type) ? 0 : (model.screen.rotateX ?? 0),
    // Y is kept: it turns a tree about its own axis, which is the one rotation that doesn't
    // tip it over.
    rotateYDeg: model.screen.rotateY ?? 0,
  };
}

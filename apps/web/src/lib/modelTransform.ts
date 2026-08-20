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
 * A rotation about Z spins a model in its own face plane. For most props that is meaningful - a
 * sign can hang at an angle, an arch can lean. For a mega tree it is not: the only useful way to
 * turn a tree is about its own vertical axis, which is RotateY, and a Z rotation can do nothing to
 * it except tip it over.
 *
 * So a Z rotation is dropped for these. It is a deliberate override of what the file says, in the
 * same spirit as taking the magnitude of a negative scale (models/transform.ts) and as ignoring
 * the sign of a tree's bottom/top ratio (models/tree.ts): all three are cases where a stored value
 * would stand a prop on its head, and nobody's yard has an upside-down mega tree. The cost is that
 * a deliberately tipped-over tree can't be expressed; the alternative is a preview that is wrong
 * about the biggest prop in the show.
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
    rotateXDeg: model.screen.rotateX ?? 0,
    rotateYDeg: model.screen.rotateY ?? 0,
  };
}

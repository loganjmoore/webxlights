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

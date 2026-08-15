// What a corner-grip drag does to a model's scale (LayoutCanvas3D's resize handles).
//
// Extracted from the canvas because it is the part with decisions in it - which axes move
// together, what stops a model collapsing to nothing, where the anchor goes when a prop has to
// stay on the ground - and none of that needs a WebGL context to check.

export interface ResizeInput {
  /** Distance from the model's centre to the pointer, in world units, on each axis. */
  halfWidthWorld: number;
  halfHeightWorld: number;
  /** The model's half-extents at scale 1, in local units. */
  unitHalfWidth: number;
  unitHalfHeight: number;
  /** World units per local unit (the renderer's NODE_SPACING). */
  unitsPerLocal: number;
  /** The scales the drag started from, so a uniform resize has a baseline to grow against. */
  startScale: number;
  startScaleZ: number;
  uniform: boolean;
}

export interface ResizeResult {
  scale: number;
  scaleY: number;
  scaleZ: number;
}

/**
 * A scale of zero collapses a model to a single point - which has no corners, so there would be
 * no grip left to drag it back out by. The floor is far below any usable size; it exists only so
 * that dragging a corner through the centre is recoverable.
 */
export const MIN_SCALE = 0.001;

export function resizeFromCorner(input: ResizeInput): ResizeResult {
  const { unitsPerLocal, startScale, startScaleZ, uniform } = input;
  const scaleX = Math.max(input.halfWidthWorld / (input.unitHalfWidth * unitsPerLocal), MIN_SCALE);
  const scaleY = Math.max(input.halfHeightWorld / (input.unitHalfHeight * unitsPerLocal), MIN_SCALE);

  if (uniform) {
    // The axis that moved furthest wins, so a drag that is mostly sideways still grows the whole
    // prop rather than the two axes fighting over it. Taking the max rather than averaging means
    // the prop always follows the pointer on at least one axis - an average lags both, which
    // reads as the handle slipping out from under the cursor.
    const base = Math.max(startScale, MIN_SCALE);
    const factor = Math.max(scaleX / base, scaleY / base);
    const scale = Math.max(startScale * factor, MIN_SCALE);
    return { scale, scaleY: scale, scaleZ: scale };
  }

  // Depth follows width. Nothing on screen shows depth directly, so left alone it would keep
  // whatever it had while the other two axes changed - a prop that ends up twice as wide and as
  // deep as it was, which looks like a bug from the one camera angle that reveals it.
  return { scale: scaleX, scaleY, scaleZ: startScaleZ * (scaleX / Math.max(startScale, MIN_SCALE)) };
}

/**
 * The anchor Y that leaves a model's lowest point resting on the ground.
 *
 * Resizing happens about the centre (transform.ts' anchor), so growing a prop drops its base by
 * half of whatever height was added. Without this, making a tree taller buries it.
 */
export function groundedAnchorY(groundY: number, halfHeightWorld: number): number {
  return groundY + halfHeightWorld;
}

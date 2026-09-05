// What a corner-grip drag does to a model's scale (LayoutCanvas3D's resize handles).
//
// Extracted from the canvas because it is the part with decisions in it - which axes move
// together, what stops a model collapsing to nothing, where the anchor goes when a prop has to
// stay on the ground - and none of that needs a WebGL context to check.

export interface ResizeInput {
  /** Distance from the model's centre to the pointer, in world units, on each axis. */
  halfWidthWorld: number;
  halfHeightWorld: number;
  /**
   * The same distances at the moment the grip was grabbed. When given, the resize is relative
   * to them - the prop grows by the ratio of "pointer now" to "pointer at grab" - rather than
   * the pointer's absolute distance setting the size outright. Absolute sizing is what made a
   * small prop leap: its grip sits a fixed minimum distance out, so the first pixel of movement
   * already implied a size many times the real one.
   */
  grabHalfWidthWorld?: number;
  grabHalfHeightWorld?: number;
  /** The model's half-extents at scale 1, in local units. */
  unitHalfWidth: number;
  unitHalfHeight: number;
  /** World units per local unit (the renderer's NODE_SPACING). */
  unitsPerLocal: number;
  /** The scales the drag started from, so a uniform resize has a baseline to grow against. */
  startScale: number;
  startScaleZ: number;
  /** The Y scale the drag started from; defaults to startScale. Only the relative path reads it. */
  startScaleY?: number;
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

/**
 * How much of the pointer's travel becomes size. Below 1 the prop grows more slowly than the
 * hand moves, which is what makes a resize controllable: at 1, doubling the grip's distance
 * doubles the prop; at 0.6 it takes about three times the distance.
 */
export const RESIZE_DAMPING = 0.6;

export function resizeFromCorner(input: ResizeInput): ResizeResult {
  const { unitsPerLocal, startScale, startScaleZ, uniform } = input;
  let scaleX: number;
  let scaleY: number;
  if (input.grabHalfWidthWorld !== undefined && input.grabHalfHeightWorld !== undefined) {
    const startY = input.startScaleY ?? startScale;
    const rx = Math.pow(Math.max(input.halfWidthWorld, 1e-6) / Math.max(input.grabHalfWidthWorld, 1e-6), RESIZE_DAMPING);
    const ry = Math.pow(Math.max(input.halfHeightWorld, 1e-6) / Math.max(input.grabHalfHeightWorld, 1e-6), RESIZE_DAMPING);
    scaleX = Math.max(startScale * rx, MIN_SCALE);
    scaleY = Math.max(startY * ry, MIN_SCALE);
  } else {
    scaleX = Math.max(input.halfWidthWorld / (input.unitHalfWidth * unitsPerLocal), MIN_SCALE);
    scaleY = Math.max(input.halfHeightWorld / (input.unitHalfHeight * unitsPerLocal), MIN_SCALE);
  }

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

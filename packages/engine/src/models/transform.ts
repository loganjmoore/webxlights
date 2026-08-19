import type { ModelGeometry, ModelNode } from "./types";
import { geometryScreenBounds } from "./bounds";

// Real xLights writes WorldPosX/Y/Z as a model's *center* point (confirmed against the
// manual/community docs - "XYZ are the center point of the model"), and RotateZ pivots around
// that same center. `ModelNode.screenX/screenY` is each shape function's own natural local
// parametrization, which is frequently NOT centered on (0,0) - Icicles hangs entirely below
// its mounting line (screenY <= 0), Window Frame/Arches/Candy Canes sit in a single quadrant.
// Treating a model's stored `screen.x/y` as if it lined up with the shape's raw (0,0) would
// misplace every asymmetric type relative to a real xLights layout. Every renderer (2D, 3D)
// and every bounds computation (auto-fit, hit-testing, 3D pick mesh) needs the same anchor -
// this file is that one shared definition, so 2D/3D can't quietly disagree with each other.
export interface ScreenTransform {
  scale?: number; // uniform, or scaleX when scaleY is also given
  scaleY?: number; // defaults to `scale` (uniform) when absent - matches every model saved before this existed
  scaleZ?: number; // defaults to `scale`; only means anything for models with real depth
  // Standard counter-clockwise-positive rotation in a Y-up coordinate system (+X rotated 90
  // degrees lands on +Y - see transform.test.ts). Neither 2D's canvas nor 3D's Three.js scene
  // flips X, and both treat increasing world Y as "visually up" (2D flips the Y *pixel value*
  // for a top-left canvas origin, not the up/down sense itself - see LayoutCanvas.vue's own
  // Y-flip comment) - so this appears as one consistent rotation direction in both renderers,
  // not independently chosen per view. Not verified against real xLights' own RotateZ
  // handedness (no reference file with a known before/after render was available) - internally
  // consistent between 2D/3D, but a real fidelity gap if xLights turns out to use the opposite
  // sign convention.
  rotateDeg?: number;
}

export function geometryCenter(geo: ModelGeometry): { x: number; y: number } {
  const b = geometryScreenBounds(geo);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

// A node's offset from the model's anchor (its true center), in local geometry units, after
// per-axis scale and rotation. Callers multiply by their own px-per-unit and add the anchor's
// world position - this function knows nothing about pixels or the DOM.
export function nodeWorldOffset(
  node: ModelNode,
  center: { x: number; y: number },
  transform: ScreenTransform,
): { x: number; y: number; z: number } {
  // Magnitudes. A negative scale is a frame convention, not an instruction to mirror - xLights'
  // model-local Y runs the other way from ours (models/matrix.ts), so a show writes ScaleY
  // negative to stand a model up the right way, and applying that sign to geometry that is
  // already the right way up turns it over. A mega tree stood on its point is the visible case.
  //
  // The importer has taken the magnitude since it learned about placement systems, but only on
  // the way in: a layout imported before that still holds the negative in its saved screen, and
  // nothing in the app would ever correct it. Taking it here too means the rule holds for data
  // already stored, and this is the one function every renderer and every bounds computation
  // goes through - so there is no second place to forget it.
  const scaleX = Math.abs(transform.scale ?? 1);
  const scaleY = Math.abs(transform.scaleY ?? scaleX);
  const scaleZ = Math.abs(transform.scaleZ ?? scaleX);
  const dx = (node.screenX - center.x) * scaleX;
  const dy = (node.screenY - center.y) * scaleY;
  // Depth is measured from the model's own axis (0), not from a centre - a cone's nodes wrap
  // symmetrically about it already.
  const dz = (node.screenZ ?? 0) * scaleZ;
  const rad = ((transform.rotateDeg ?? 0) * Math.PI) / 180;
  // RotateZ spins the model in its own X/Y plane, so depth is unchanged by it.
  if (rad === 0) return { x: dx, y: dy, z: dz };
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos, z: dz };
}

// Half-extents of the *transformed* (scaled + rotated) shape, still centered on the anchor by
// construction - rotating/scaling around the center can't move the center. Used for auto-fit
// and hit-testing bounds, and the 3D pick mesh's box size.
export function transformedHalfExtents(
  geo: ModelGeometry,
  transform: ScreenTransform,
): { halfW: number; halfH: number; halfD: number } {
  if (geo.nodes.length === 0) return { halfW: 0, halfH: 0, halfD: 0 };
  const center = geometryCenter(geo);
  let maxAbsX = 0;
  let maxAbsY = 0;
  let maxAbsZ = 0;
  for (const node of geo.nodes) {
    const off = nodeWorldOffset(node, center, transform);
    if (Math.abs(off.x) > maxAbsX) maxAbsX = Math.abs(off.x);
    if (Math.abs(off.y) > maxAbsY) maxAbsY = Math.abs(off.y);
    if (Math.abs(off.z) > maxAbsZ) maxAbsZ = Math.abs(off.z);
  }
  return { halfW: maxAbsX, halfH: maxAbsY, halfD: maxAbsZ };
}

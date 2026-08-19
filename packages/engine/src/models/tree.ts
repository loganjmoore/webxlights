import type { ModelGeometry } from "./types";
import { computeVerticalMatrixTopLeft } from "./matrix";

export interface TreeParams {
  strings: number;
  nodesPerString: number;
  /**
   * Folds per string (xLights' StrandsPerString / parm3), default 1.
   *
   * "The Strands per String represents the number of 'folds' in each string of lights. If the
   * string will go up once and terminate, the Strands per String is 1." A string that goes up,
   * folds, and comes back down is two strands - so the tree shows `strings x strandsPerString`
   * vertical lines, and each of them is `nodesPerString / strandsPerString` nodes tall. The
   * manual's own example: 15 strings at 2 strands each is 30 visual strands.
   */
  strandsPerString?: number;
  style?: "Round" | "Flat" | "Ribbon"; // default Round
  degrees?: number; // Round only, default 360
  bottomTopRatio?: number; // default 6.0 (bottom radius = top radius x ratio)
}

/**
 * How wide a tree is at the base, as a fraction of its height.
 *
 * A default, not a derivation, and the one number here that isn't forced. It can't come from the
 * node counts: in a real mega tree the nodes along a string sit inches apart while the strings
 * at the base are spread a foot or more around the hoop, so `ringRadiusForNodeCount(strings)` -
 * the right answer for a Circle or a Wreath - would assume the base is packed as densely as a
 * string is and give a 16 x 50 tree a base 5 units across against a height of 49. In xLights the
 * width comes from the model's own box, and ours is set by ScaleX; this is what it looks like
 * before anyone sizes it. 0.75 is roughly a real mega tree (an 8ft hoop under a 12ft peak).
 */
const BASE_WIDTH_PER_HEIGHT = 0.75;

// SPEC ch4: "subclass of MatrixModel... Buffer identical to matrix; screen coords wrap
// strands around a cone" (Round), a flat fan (Flat), or a vertical ribbon strip (Ribbon).
// ponytail: Rotation/Spiral Wraps/Perspective screen-shaping deferred — plain cone/fan/ribbon.
//
// The radius is in node units, like every other shape here (units.ts: "one local unit == the
// spacing between two adjacent nodes"). It used to be in raw `bottomTopRatio` units - 1 at the
// apex to 6 at the base - a number with no relationship to node spacing at all, while the
// height beside it was `bufY`, a real count of nodes. At the default 16 x 50 that made a cone
// 12 wide and 51 tall, with sides **5.8 degrees off vertical**: on screen, a pair of
// near-vertical lines rather than a tree.
//
// It also read upside down, for a reason worth writing down because it isn't obvious from the
// arithmetic: the strands converge at the apex, so the same 16 points that spread across 12
// units at the base were crammed into 2 at the top. A cone that tall and thin shows that as a
// dense blob at the top over sparse scattered dots below - visually top-heavy, which is what an
// upside-down tree looks like. The taper was the right way up all along; the aspect it was
// drawn at hid that. One fix answers both.
export function computeTree(params: TreeParams): ModelGeometry {
  const style = params.style ?? "Round";
  const degrees = params.degrees ?? 360;
  // A ratio at or below zero would put the apex on or through the axis and turn the cone inside
  // out; 1 is a cylinder, which is an unusual tree but a legitimate one, and stays allowed.
  const bottomTopRatio = Math.max(params.bottomTopRatio ?? 6.0, 1e-6);

  // Folding a string turns it into several vertical lines side by side, each a fraction as tall.
  // Ignoring it - which this did - gets a tree wrong twice over: a 16-string tree with 4 strands
  // apiece drew 16 lines instead of 64, and drew them four times taller than they are, because
  // all 50 nodes went into one run instead of four of twelve.
  //
  // Only folded when it divides evenly. xLights derives nodes-per-string from the fold count, so
  // real files always do; a file where it doesn't is either hand-edited or from a version that
  // meant something else by it, and dropping the remainder would silently move every channel
  // after this model.
  const strands = Math.max(Math.trunc(params.strandsPerString ?? 1), 1);
  const folds = strands > 1 && params.nodesPerString % strands === 0 ? strands : 1;
  const geo = computeVerticalMatrixTopLeft({
    strings: params.strings * folds,
    nodesPerString: params.nodesPerString / folds,
  });

  // Height in node units: a 50-node string is 49 units tall, the same as a 50-node line.
  const heightUnits = Math.max(geo.height - 1, 1);
  const baseRadius = (heightUnits * BASE_WIDTH_PER_HEIGHT) / 2;

  for (const node of geo.nodes) {
    // 0 at the base, 1 at the apex. `bufY` counts up from the bottom: the matrix's Top Left
    // start puts a string's first node at `height - 1`, and both renderers draw larger world Y
    // higher up the screen (LayoutCanvas.vue flips the Y *pixel* value for a top-left canvas
    // origin, not the up/down sense itself).
    const heightT = geo.height > 1 ? node.bufY / (geo.height - 1) : 0;
    const strandT = geo.width > 1 ? node.bufX / geo.width : 0;

    if (style === "Ribbon") {
      node.screenX = node.bufX;
      node.screenY = node.bufY;
      continue;
    }

    // Base radius at the bottom, base/ratio at the apex - so bottom/top is exactly
    // `bottomTopRatio`, per this parameter's own doc comment ("bottom radius = top radius x
    // ratio"), and the widest part is at the bottom.
    const radius = baseRadius * ((1 - heightT) + heightT / bottomTopRatio);
    const angle = (strandT * (degrees * Math.PI)) / 180;
    node.screenX = Math.cos(angle) * radius;
    node.screenY = node.bufY;
    if (style !== "Flat") {
      // Round: the strands wrap around a cone, so the wrap belongs on the Z axis. Folding it
      // into screenY (as a "depth cue") collapsed the cone into a filled triangle in both the
      // 2D and 3D views - the single most visible difference against real xLights' 3D layout,
      // where a mega tree reads as a cone with an elliptical base. Z is in the same node units
      // as X, so the cone is as deep as it is wide.
      node.screenZ = Math.sin(angle) * radius;
    }
  }
  return geo;
}

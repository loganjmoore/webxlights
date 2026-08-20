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
 * How wide a tree is, as a fraction of its height - xLights' own number, not a guess.
 *
 * `TreeModel::SetTreeCoord`: `RenderHt = BufferHt * 3; RenderWi = ((double)RenderHt) / 1.8;`
 * so the widest part of the tree is its height over 1.8. This was 0.75, picked to look like a
 * real mega tree, which is close but not what xLights draws.
 */
const WIDTH_PER_HEIGHT = 1 / 1.8;

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
  const bottomTopRatio = params.bottomTopRatio ?? 6.0;

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

  // A tree stands on its wide end.
  //
  // TreeModel::SetTreeCoord takes the ratio literally in both directions:
  //
  //     if (_botTopRatio != 0.0f) { topradius = radius / std::abs(_botTopRatio); }
  //     if (_botTopRatio < 0.0f) { std::swap(topradius, radius); }
  //
  // so a negative ratio flares the cone upward, and a ratio between 0 and 1 does the same thing
  // by arithmetic. This deliberately does not: the magnitude sets how sharply the tree tapers,
  // and the wide end is always the bottom.
  //
  // That is a real departure from xLights and worth stating plainly. The reason is that nobody
  // builds an upside-down mega tree. A stored value that would flare one is a data artifact -
  // another tool's sign convention, a hand-edited file, a number entered as its own reciprocal -
  // and the two outcomes are not symmetrical: rendering a normal tree upside down makes the whole
  // preview useless for the prop it is most needed for, while refusing to render a genuinely
  // inverted cone costs a shape nobody has in their yard.
  //
  // A ratio of 0 stays a cylinder, which is what xLights does with it and is a shape people do
  // build - a wrapped pole.
  const taper = Math.abs(bottomTopRatio);
  const bottomRadius = (heightUnits * WIDTH_PER_HEIGHT) / 2;
  const topRadius = taper === 0 ? bottomRadius : bottomRadius / Math.max(taper, 1 / taper);

  // `StartAngle = -radians / 2` and `AngleIncr = radians / BufferWi`, except that a tree which
  // isn't nearly a full circle divides by `BufferWi - 1` so its last strand lands exactly on the
  // far edge rather than one step short of it. Centred on zero, so a part-circle tree faces the
  // viewer instead of starting at one side.
  const radians = (degrees * Math.PI) / 180;
  const startAngle = -radians / 2;
  const angleIncrement = degrees < 350 && geo.width > 1 ? radians / (geo.width - 1) : radians / geo.width;

  for (const node of geo.nodes) {
    // 0 at the base, 1 at the apex. `bufY` counts up from the bottom: the matrix's Top Left
    // start puts a string's first node at `height - 1`, and both renderers draw larger world Y
    // higher up the screen (LayoutCanvas.vue flips the Y *pixel* value for a top-left canvas
    // origin, not the up/down sense itself).
    const heightT = geo.height > 1 ? node.bufY / (geo.height - 1) : 0;

    if (style === "Ribbon") {
      node.screenX = node.bufX;
      node.screenY = node.bufY;
      continue;
    }

    // Interpolated up the strand between the two radii, the way xLights does it:
    // `screenX = xb + (xt - xb) * posOnString`, with posOnString 0 at the base.
    const radius = bottomRadius + (topRadius - bottomRadius) * heightT;
    const angle = startAngle + node.bufX * angleIncrement;
    // sin for X and cos for Z, matching `xb = radius * sin(angle)` / `zb = radius * cos(angle)`.
    // It only shows on a tree that isn't a full circle: with these the other way round, a 180
    // degree tree faces sideways instead of at the house.
    node.screenX = Math.sin(angle) * radius;
    node.screenY = node.bufY;
    if (style !== "Flat") {
      // Round: the strands wrap around a cone, so the wrap belongs on the Z axis. Folding it
      // into screenY (as a "depth cue") collapsed the cone into a filled triangle in both the
      // 2D and 3D views - the single most visible difference against real xLights' 3D layout,
      // where a mega tree reads as a cone with an elliptical base. Z is in the same node units
      // as X, so the cone is as deep as it is wide.
        node.screenZ = Math.cos(angle) * radius;
    }
  }
  return geo;
}

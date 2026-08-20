import type { ModelGeometry } from "./types";
import { geometryCenter, transformedHalfExtents } from "./transform";
import { parsePolyPointPath } from "./polyPoints";

// xLights does NOT place every model the same way. Each model class picks a
// ModelScreenLocation, and the three in play for the types webXLights renders store completely
// different things in the XML:
//
//   Boxed      - WorldPosX/Y/Z is the model's CENTER; ScaleX/Y/Z size it; RotateZ turns it.
//   Two point  - WorldPosX/Y/Z is one END of the model, and X2/Y2/Z2 is the offset to the
//                other end. Length and angle come from that vector. ScaleX/RotateZ are not
//                where the size and rotation live.
//   Three point- Two point, plus Height (a multiple of the length) for the perpendicular axis.
//   Poly point - An ordered list of vertices in PointData. The model's *shape* is in the
//                placement attributes, so this one is read in models/polyPoints.ts and turned
//                into geometry as well as a position.
//
// Import used to read WorldPos as a centre for everything and take ScaleX/RotateZ at face
// value, which is right for Boxed models and wrong for every two/three-point one: an arch, a
// candy cane, a roofline or a run of icicles landed half its own length away from where it
// belongs, at the default size, unrotated. Those are exactly the props a real yard is mostly
// made of, so an imported show looked scrambled even though each model's own geometry was
// fine.
export type PlacementSystem = "boxed" | "twoPoint" | "threePoint" | "polyLine";

// Which system each DisplayAs uses, confirmed against the xLights manual's own Layout
// descriptions rather than inferred from the shape alone: a Single Line is drawn
// between a green start handle and a blue end handle (two point); Candy Canes add a third
// handle; and Icicles are placed by dragging "the green or top blue pixel to hang the icicles
// at an angle and then ... the lower blue pixel to cause the drop to shear" - three handles,
// so Icicles is a three-point model, not the two-point one this originally assumed. Arches are
// the same shape of prop as Candy Canes (a run along a line with an arc height) and are
// treated as three-point too; the manual's Arches page documents its properties but not its
// handles, so that one is inference rather than quotation.
//
// Poly Line's PolyPointScreenLocation is the fourth system. It is not two-point math with more
// points: the vertex list is the model's shape, so it is read once (polyPoints.ts) and used
// both to build the geometry and to place it. A Poly Line with no usable PointData - one drawn
// in webXLights rather than imported - still falls back to the boxed reading of a straight run.
const PLACEMENT_BY_TYPE: Record<string, PlacementSystem> = {
  "Single Line": "twoPoint",
  Arches: "threePoint",
  "Candy Canes": "threePoint",
  Icicles: "threePoint",
  "Poly Line": "polyLine",
};

export function placementSystemFor(displayAs: string): PlacementSystem {
  return PLACEMENT_BY_TYPE[displayAs] ?? "boxed";
}

export interface PlacedScreen {
  x: number;
  y: number;
  z: number;
  scale: number;
  scaleY?: number;
  scaleZ?: number;
  rotate: number;
  /** RotateX / RotateY, which tip and swing a model out of the plane it is authored in. */
  rotateX: number;
  rotateY: number;
}

function num(attrs: Record<string, string>, key: string, fallback: number): number {
  const parsed = parseFloat(attrs[key] ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

// The endpoint offsets are the one set of attribute names not confirmed against a real file,
// and xLights' own XML is not consistently capitalised across attributes. Accepting the
// plausible spellings costs nothing and avoids the whole two/three-point path silently never
// firing over a capital letter - which would look exactly like "the fix didn't work".
function numAny(attrs: Record<string, string>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const parsed = parseFloat(attrs[key] ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Must agree with fromAttrs.ts's own reading of NodesPerString, because the local path it
// hands computePolyLine and the scale derived here are two halves of the same conversion.
function polyLineNodeCount(attrs: Record<string, string>): number {
  const parsed = parseInt(attrs.NodesPerString ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 50;
}

// Which system actually got used for a model, so an import can report it. A show full of
// arches and rooflines that reports zero two/three-point models means the attribute names
// above are wrong for that file - a visible signal instead of a silent fallback.
export function appliedPlacementFor(displayAs: string, attrs: Record<string, string>): PlacementSystem {
  const system = placementSystemFor(displayAs);
  if (system === "boxed") return "boxed";
  if (system === "polyLine") {
    return parsePolyPointPath(attrs, polyLineNodeCount(attrs)) ? "polyLine" : "boxed";
  }
  const dx = numAny(attrs, ["X2", "x2"], 0);
  const dy = numAny(attrs, ["Y2", "y2"], 0);
  const dz = numAny(attrs, ["Z2", "z2"], 0);
  // Z counts. A run along the depth axis - lights down a gutter, a line from the house out to the
  // street - has no extent in X or Y at all, so measuring only those two called it degenerate and
  // sent it to the boxed reading, where it came out as a dot.
  return Math.hypot(dx, dy, dz) < 1e-9 ? "boxed" : system;
}

// Which of a boxed model's scale attributes were stored negative. The importer reads them as
// magnitudes (see screenFromAttrs), which is a real decision about someone's show, so it is
// reported rather than applied silently: a file where this fires on nothing, yet still imports
// models upside down, is telling you the cause is something else - RotateZ, most likely.
export function negativeScaleAttrs(attrs: Record<string, string>): string[] {
  return ["ScaleX", "ScaleY", "ScaleZ"].filter((key) => {
    const parsed = parseFloat(attrs[key] ?? "");
    return Number.isFinite(parsed) && parsed < 0;
  });
}

// Local (unscaled, unrotated) size of a shape, in the same units node.screenX/Y are in.
function localSize(geo: ModelGeometry | null): { width: number; height: number } {
  if (!geo || geo.nodes.length === 0) return { width: 1, height: 1 };
  const half = transformedHalfExtents(geo, { scale: 1, scaleY: 1, rotateDeg: 0 });
  return { width: Math.max(half.halfW * 2, 1e-6), height: Math.max(half.halfH * 2, 1e-6) };
}

// The two readings of a boxed model's ScaleX/Y/Z. They differ by a factor of the model's node
// count, which is why getting it wrong doesn't merely mis-size one prop - it makes a 32-wide
// matrix thirty times the size of the roofline next to it and swamps the whole layout.
//
//   perNode   - ScaleX multiplies a render size measured in node units, so world width is
//               ScaleX x nodesWide.
//   worldSize - ScaleX *is* the model's world width; the shape is normalised into it.
//
// The xLights manual says only "ScaleXYZ determine the size of the model", which doesn't
// separate the two, and the community documentation doesn't either. Rather than pick one on a
// hunch and bake it in, both are implemented and `chooseBoxedScaleReading` picks per file from
// evidence inside that file - see below.
export type BoxedScaleReading = "perNode" | "worldSize";

// `unitsPerLocal` is the renderer's local-unit-to-world factor (NODE_SPACING): a node offset of
// 1 becomes this many world units on the canvas. Placement has to know it, because xLights'
// X2/Y2 are a length in world units and our scale multiplies a local one.
export function screenFromAttrs(
  displayAs: string,
  attrs: Record<string, string>,
  geo: ModelGeometry | null,
  unitsPerLocal: number,
  boxedScale: BoxedScaleReading = "perNode",
): PlacedScreen {
  const system = placementSystemFor(displayAs);
  const x1 = num(attrs, "WorldPosX", 0);
  const y1 = num(attrs, "WorldPosY", 0);
  const z1 = num(attrs, "WorldPosZ", 0);

  if (system === "boxed") {
    const perLocal = unitsPerLocal || 1;
    const rotate = num(attrs, "RotateZ", 0);
    const rotateX = num(attrs, "RotateX", 0);
    const rotateY = num(attrs, "RotateY", 0);
    // A boxed model's scale carries a sign, and taking it at face value turned trees upside
    // down. xLights' model-local Y runs the other way from ours - its render buffer's row 0 is
    // the top, ours is the bottom (models/matrix.ts) - so a negative scale there is how a model
    // is drawn the right way up, not an instruction to mirror it. Applying it to geometry that
    // is already the right way up flips it: a mega tree stood on its point.
    //
    // Only the magnitude is used. The cost is that a model somebody deliberately mirrored in
    // xLights comes in unmirrored; the alternative was every tree in every show upside down,
    // and asymmetric props (trees, icicles, window frames) are exactly the ones it ruins.
    // `negativeScaleAttrs` reports it so an import can say how many models this touched.
    const sx = Math.abs(num(attrs, "ScaleX", 1));
    const sy = attrs.ScaleY !== undefined ? Math.abs(num(attrs, "ScaleY", 1)) : undefined;
    const sz = attrs.ScaleZ !== undefined ? Math.abs(num(attrs, "ScaleZ", 1)) : undefined;

    if (boxedScale === "worldSize") {
      // ScaleX is the world width outright, so the shape is normalised into it: our renderers
      // draw a model at localExtent x screen.scale x unitsPerLocal, and that has to come out
      // equal to ScaleX.
      const size = localSize(geo);
      // Depth has no local extent to divide by (a flat model's is zero), so it follows X - the
      // same thing every other placement system does with Z.
      return {
        x: x1,
        y: y1,
        z: z1,
        scale: sx / (size.width * perLocal),
        scaleY: sy === undefined ? undefined : sy / (size.height * perLocal),
        scaleZ: sz === undefined ? undefined : sz / (size.width * perLocal),
        rotate,
        rotateX,
        rotateY,
      };
    }

    // perNode: ScaleX multiplies a render size measured in node units, so a show's ScaleX
    // values are tuned against node counts and a model's world width is ScaleX x renderWidth.
    // Our renderers draw a model at localExtent x screen.scale x unitsPerLocal, and (since
    // units.ts) localExtent is also in node units, so matching xLights means:
    //
    //     localExtent x ourScale x unitsPerLocal  ==  ScaleX x localExtent
    //     => ourScale = ScaleX / unitsPerLocal
    return {
      x: x1,
      y: y1,
      z: z1,
      scale: sx / perLocal,
      scaleY: sy === undefined ? undefined : sy / perLocal,
      scaleZ: sz === undefined ? undefined : sz / perLocal,
      rotate,
      rotateX,
      rotateY,
    };
  }

  if (system === "polyLine") {
    const path = parsePolyPointPath(attrs, polyLineNodeCount(attrs));
    // No vertex list to place against - it's a plain straight run, so read it as boxed.
    if (!path) return screenFromAttrs("__boxed__", attrs, geo, unitsPerLocal, boxedScale);

    // The geometry built from the same path already carries every angle in the run, so there's
    // nothing left for a rotation to do and the scale has to stay uniform: skewing one axis
    // would bend the corners the vertices just described.
    const scale = path.worldLength / (path.localLength * (unitsPerLocal || 1));
    // Vertex 0 sits at WorldPos, but our renderers hang a model off the centre of its own
    // bounding box - so the anchor is WorldPos plus the offset from vertex 0 to that centre.
    // Z needs no such correction: transform.ts measures depth from the model's own axis rather
    // than from a centre, so the anchor's Z is vertex 0's outright.
    const center = geo ? geometryCenter(geo) : { x: 0, y: 0 };
    const perWorld = path.worldLength / path.localLength;
    return {
      x: x1 + center.x * perWorld,
      y: y1 + center.y * perWorld,
      z: z1,
      scale,
      scaleY: scale,
      scaleZ: scale,
      rotate: 0,
      rotateX: num(attrs, "RotateX", 0),
      rotateY: num(attrs, "RotateY", 0),
    };
  }

  const dx = numAny(attrs, ["X2", "x2"], 0);
  const dy = numAny(attrs, ["Y2", "y2"], 0);
  const dz = numAny(attrs, ["Z2", "z2"], 0);
  // The real distance between the endpoints, depth included. This was hypot(dx, dy), which is
  // the length of the run's *shadow* on the front wall - correct for a line across the house,
  // zero for one running away from it.
  const length = Math.hypot(dx, dy, dz);

  // A degenerate or missing endpoint vector (both offsets zero) can't say anything about size
  // or angle - fall back to the boxed reading rather than collapsing the model to nothing.
  if (length < 1e-9) {
    return screenFromAttrs("__boxed__", attrs, geo, unitsPerLocal, boxedScale);
  }

  const size = localSize(geo);
  // The anchor is the midpoint: our renderers place a model around its own centre
  // (transform.ts), while xLights stores one end here.
  const x = x1 + dx / 2;
  const y = y1 + dy / 2;
  const z = z1 + dz / 2;
  // A run drawn right-to-left has an endpoint vector pointing backwards, and turning the model
  // through that angle turns it over: an arch came out as a bowl, a candy cane hooked at the
  // bottom. In xLights the third handle is what decides which side the arc rises to, and which
  // end you happened to anchor from doesn't change it - you can drag either handle and it stays
  // an arch. So a backwards vector is folded into a mirror along the model's own X axis rather
  // than a half turn: same line, same endpoints, same node order along it, but "up" stays up.
  //
  // A run with depth also needs turning into it, which is a yaw about Y on top of the angle in
  // the X/Y plane. Left at zero, a gutter line running front-to-back was drawn as if it ran
  // across the front of the house instead.
  //
  // A flat run keeps exactly the arithmetic it had. The two forms agree for a forward-pointing
  // vector, but not for a backward one - `atan2(dy, dx)` is what the mirror rule below is written
  // against, and re-deriving it from a horizontal magnitude would quietly change which side an
  // arch rises to.
  const hasDepth = Math.abs(dz) > 1e-9;
  const rawRotate = hasDepth
    ? (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
    : (Math.atan2(dy, dx) * 180) / Math.PI;
  const backwards = rawRotate > 90 || rawRotate <= -90;
  const rotate = backwards ? rawRotate - Math.sign(rawRotate) * 180 : rawRotate;
  const mirror = backwards ? -1 : 1;
  // A two/three-point model takes its angles from its endpoints where the endpoints say
  // something. A tip out of the vertical plane doesn't come from them - an arch laid flat on a
  // lawn is RotateX, and nothing about its two ends says so - and neither does yaw on a run that
  // is flat, so that keeps coming from the file.
  const rotateX = num(attrs, "RotateX", 0);
  const rotateY = hasDepth ? (Math.atan2(-dz, dx) * 180) / Math.PI : num(attrs, "RotateY", 0);
  const scale = (mirror * length) / (size.width * unitsPerLocal);

  if (system === "twoPoint") {
    // Nothing in the XML constrains the perpendicular axis, so it stays proportional. The
    // mirror belongs to X alone - it's a direction, not a size - so Y takes the magnitude.
    const perpendicular = Math.abs(scale);
    return { x, y, z, scale, scaleY: perpendicular, scaleZ: perpendicular, rotate, rotateX, rotateY };
  }

  // Three point: Height is a multiple of the model's length (xLights' own convention - an arch
  // with height 1 is as tall as it is wide), which is what makes a 5-arch set import as arches
  // rather than as flat lines.
  //
  // When the attribute is absent, keep the shape's own proportions instead of assuming
  // height == length. Defaulting Height to 1 is badly wrong for the props that have it: a run
  // of icicles is a fraction as deep as it is wide, and squaring it up would drop the drops
  // most of the way down the yard.
  const heightAttr = attrs.Height ?? attrs.height;
  if (heightAttr === undefined) {
    const perpendicular = Math.abs(scale);
    return { x, y, z, scale, scaleY: perpendicular, scaleZ: perpendicular, rotate, rotateX, rotateY };
  }
  // Height carries its own sign, and that sign is the one thing that should be able to turn the
  // arc over - xLights' third handle can be dragged below the line. It is deliberately not
  // combined with the mirror above: doing both is what flipped a right-to-left arch.
  const height = numAny(attrs, ["Height", "height"], 1);
  const scaleY = (length * height) / (size.height * unitsPerLocal);
  return { x, y, z, scale, scaleY, scaleZ: Math.abs(scale), rotate, rotateX, rotateY };
}

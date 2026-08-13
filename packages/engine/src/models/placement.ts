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
  return Math.hypot(dx, dy) < 1e-9 ? "boxed" : system;
}

// Local (unscaled, unrotated) size of a shape, in the same units node.screenX/Y are in.
function localSize(geo: ModelGeometry | null): { width: number; height: number } {
  if (!geo || geo.nodes.length === 0) return { width: 1, height: 1 };
  const half = transformedHalfExtents(geo, { scale: 1, scaleY: 1, rotateDeg: 0 });
  return { width: Math.max(half.halfW * 2, 1e-6), height: Math.max(half.halfH * 2, 1e-6) };
}

// `unitsPerLocal` is the renderer's local-unit-to-world factor (NODE_SPACING): a node offset of
// 1 becomes this many world units on the canvas. Placement has to know it, because xLights'
// X2/Y2 are a length in world units and our scale multiplies a local one.
export function screenFromAttrs(
  displayAs: string,
  attrs: Record<string, string>,
  geo: ModelGeometry | null,
  unitsPerLocal: number,
): PlacedScreen {
  const system = placementSystemFor(displayAs);
  const x1 = num(attrs, "WorldPosX", 0);
  const y1 = num(attrs, "WorldPosY", 0);
  const z1 = num(attrs, "WorldPosZ", 0);

  if (system === "boxed") {
    // xLights' ScaleX/Y/Z multiply the model's *render size*, which is measured in node units -
    // so a real show's ScaleX values are tuned against node counts, and a model's world width
    // is ScaleX x renderWidth. Our renderers draw a model at
    // localExtent x screen.scale x unitsPerLocal, and (since units.ts) localExtent is also in
    // node units, so matching xLights means:
    //
    //     localExtent x ourScale x unitsPerLocal  ==  ScaleX x localExtent
    //     => ourScale = ScaleX / unitsPerLocal
    //
    // Taking ScaleX at face value instead - what this did before - inflated every boxed model
    // by exactly unitsPerLocal, which is why an imported show came out as a pile of
    // overlapping props at wildly different sizes instead of a yard.
    const perLocal = unitsPerLocal || 1;
    const scaleX = num(attrs, "ScaleX", 1) / perLocal;
    const scaleYRaw = attrs.ScaleY !== undefined ? num(attrs, "ScaleY", 1) / perLocal : undefined;
    const scaleZRaw = attrs.ScaleZ !== undefined ? num(attrs, "ScaleZ", 1) / perLocal : undefined;
    return { x: x1, y: y1, z: z1, scale: scaleX, scaleY: scaleYRaw, scaleZ: scaleZRaw, rotate: num(attrs, "RotateZ", 0) };
  }

  if (system === "polyLine") {
    const path = parsePolyPointPath(attrs, polyLineNodeCount(attrs));
    // No vertex list to place against - it's a plain straight run, so read it as boxed.
    if (!path) return screenFromAttrs("__boxed__", attrs, geo, unitsPerLocal);

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
    };
  }

  const dx = numAny(attrs, ["X2", "x2"], 0);
  const dy = numAny(attrs, ["Y2", "y2"], 0);
  const dz = numAny(attrs, ["Z2", "z2"], 0);
  const length = Math.hypot(dx, dy);

  // A degenerate or missing endpoint vector (both offsets zero) can't say anything about size
  // or angle - fall back to the boxed reading rather than collapsing the model to nothing.
  if (length < 1e-9) {
    return screenFromAttrs("__boxed__", attrs, geo, unitsPerLocal);
  }

  const size = localSize(geo);
  // The anchor is the midpoint: our renderers place a model around its own centre
  // (transform.ts), while xLights stores one end here.
  const x = x1 + dx / 2;
  const y = y1 + dy / 2;
  const z = z1 + dz / 2;
  const rotate = (Math.atan2(dy, dx) * 180) / Math.PI;
  const scale = length / (size.width * unitsPerLocal);

  if (system === "twoPoint") {
    // Nothing in the XML constrains the perpendicular axis, so it stays proportional.
    return { x, y, z, scale, scaleY: scale, scaleZ: scale, rotate };
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
    return { x, y, z, scale, scaleY: scale, scaleZ: scale, rotate };
  }
  const height = numAny(attrs, ["Height", "height"], 1);
  const scaleY = (length * height) / (size.height * unitsPerLocal);
  return { x, y, z, scale, scaleY, scaleZ: scale, rotate };
}

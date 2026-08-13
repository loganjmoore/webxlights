// Poly Line is the one model type whose shape lives in the placement attributes rather than in
// a handful of counts: xLights' PolyPointScreenLocation stores an ordered list of vertices in
// `PointData` (with `NumPoints`, and `cPointData` for per-segment curve control points). Until
// this file existed the importer ignored them entirely, so every Poly Line came in as a
// straight horizontal run placed by the boxed reading - which is exactly wrong for the props
// Poly Line is normally used for: a house outline, a roof run that turns a corner, a driveway
// edge. The node count was right and the shape was gone.
//
// Two things are read out of PointData here, and they have very different confidence levels:
//
//   The SHAPE (where the run turns, and by how much) is unambiguous - it's the relative
//   geometry of the vertices, and no coordinate convention changes it. This is the part that
//   makes an imported layout stop looking scrambled.
//
//   The UNITS are not stated anywhere I could confirm against a real file. xLights has written
//   these normalized into 0..1 (sized by ScaleX/Y/Z) in some versions and as plain world
//   offsets in others, so both are accepted and told apart at parse time by the only signal
//   that separates them reliably - normalized data is 0..1 by construction, and a real prop is
//   never under one world unit across. `units` reports which reading fired so a wrong guess is
//   visible in the placement report instead of silent.
//
// The first vertex is treated as the model's anchor, i.e. WorldPos. That isn't a guess: it's
// how xLights' TwoPointScreenLocation already behaves (WorldPos is one end, X2/Y2/Z2 the offset
// to the other), and PolyPoint is the N-point generalisation of it. Anchoring on vertex 0 also
// means the two conventions above only disagree about size, never about position.
//
// Not read: cPointData. Curved segments render as straight ones between their endpoints - a
// real remaining gap (PARITY.md), not a silent approximation.

export interface PolyPoint {
  x: number;
  y: number;
  z: number;
}

export interface PolyPointPath {
  /** Vertices as offsets from WorldPos, in world units. First entry is always the origin. */
  world: PolyPoint[];
  /** The same path in local node units - total path length is `nodeCount - 1`, so adjacent
   *  nodes sit one local unit apart, the convention every model type shares (units.ts). */
  local: PolyPoint[];
  /** Which reading of PointData's coordinates was applied. */
  units: "normalized" | "world";
  worldLength: number;
  localLength: number;
}

const FLOAT = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;

// PointData is a flat list of numbers; the delimiters have varied (commas, spaces) and so has
// the stride (x,y,z per vertex, or x,y for older 2D-only data). Pull the numbers out and let
// NumPoints pick the stride when it can - a list that divides evenly both ways is otherwise
// genuinely ambiguous.
function parseFlatPoints(raw: string, declaredPoints: number): PolyPoint[] {
  const values = (raw.match(FLOAT) ?? []).map(Number).filter(Number.isFinite);
  if (values.length < 4) return [];

  let stride: number;
  if (declaredPoints >= 2 && values.length === declaredPoints * 3) stride = 3;
  else if (declaredPoints >= 2 && values.length === declaredPoints * 2) stride = 2;
  else if (values.length % 3 === 0) stride = 3;
  else if (values.length % 2 === 0) stride = 2;
  else return [];

  const points: PolyPoint[] = [];
  for (let i = 0; i + stride <= values.length; i += stride) {
    points.push({ x: values[i]!, y: values[i + 1]!, z: stride === 3 ? values[i + 2]! : 0 });
  }
  return points;
}

function numAttr(attrs: Record<string, string>, key: string, fallback: number): number {
  const parsed = parseFloat(attrs[key] ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Normalized point data is 0..1 by construction. A prop whose every vertex is within one world
// unit of the first is smaller than the spacing between two of its own nodes, so there is no
// real layout the two readings can be confused in.
function looksNormalized(points: PolyPoint[]): boolean {
  return points.every((p) => Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001 && Math.abs(p.z) <= 1.0001);
}

function pathLength(points: PolyPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

/**
 * Read a Poly Line's vertex path out of its raw xLights attributes.
 *
 * Returns null - meaning "fall back to a straight line placed the boxed way" - when the
 * attributes are absent, unparseable, or describe a degenerate path. A Poly Line drawn in
 * webXLights itself has no PointData at all and takes that path, which is correct: it really
 * is a straight line until someone gives it vertices.
 */
export function parsePolyPointPath(attrs: Record<string, string>, nodeCount: number): PolyPointPath | null {
  const raw = attrs.PointData ?? attrs.pointData;
  if (!raw) return null;

  const points = parseFlatPoints(raw, Math.trunc(numAttr(attrs, "NumPoints", 0)));
  if (points.length < 2) return null;

  const units = looksNormalized(points) ? "normalized" : "world";
  const sx = units === "normalized" ? numAttr(attrs, "ScaleX", 1) : 1;
  const sy = units === "normalized" ? numAttr(attrs, "ScaleY", sx) : 1;
  const sz = units === "normalized" ? numAttr(attrs, "ScaleZ", sx) : 1;

  const origin = points[0]!;
  const world = points.map((p) => ({
    x: (p.x - origin.x) * sx,
    y: (p.y - origin.y) * sy,
    z: (p.z - origin.z) * sz,
  }));

  const worldLength = pathLength(world);
  if (!Number.isFinite(worldLength) || worldLength < 1e-9) return null;

  // One local unit per node gap, so the geometry that comes out of this is measured in the same
  // units as every other model type and placement can size it with the same arithmetic.
  const localLength = Math.max(nodeCount - 1, 1);
  const k = localLength / worldLength;
  const local = world.map((p) => ({ x: p.x * k, y: p.y * k, z: p.z * k }));

  return { world, local, units, worldLength, localLength };
}

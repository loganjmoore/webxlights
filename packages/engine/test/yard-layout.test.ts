import { describe, expect, it } from "vitest";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import { screenFromAttrs } from "../src/models/placement";
import { transformedHalfExtents } from "../src/models/transform";

const SPACING = 4;

// A yard written the way xLights writes one: boxed models carry node-unit ScaleX/ScaleY,
// two/three-point models carry an endpoint vector. Before placement understood the difference
// (and before ring models used node units), importing this produced a 699x1840 pile of
// overlapping props - one model covering the whole canvas with the rest crushed into a corner.
// These are the structural properties that told us it was wrong, as assertions.
const YARD: Array<[string, Record<string, string>]> = [
  ["Tree", { NumStrings: "16", NodesPerString: "50", WorldPosX: "-260", WorldPosY: "90", ScaleX: "24", ScaleY: "7" }],
  ["Matrix", { NumStrings: "40", NodesPerString: "25", WorldPosX: "40", WorldPosY: "120", ScaleX: "2", ScaleY: "2" }],
  ["Single Line", { NumStrings: "1", NodesPerString: "80", WorldPosX: "-60", WorldPosY: "215", X2: "260", Y2: "40" }],
  ["Arches", { NumArches: "5", NodesPerArch: "25", WorldPosX: "-60", WorldPosY: "20", X2: "200", Y2: "0", Height: "0.45" }],
  ["Wreath", { NumStrings: "1", NodesPerString: "60", WorldPosX: "170", WorldPosY: "20", ScaleX: "1.4", ScaleY: "1.4" }],
  ["Star", { NumStrings: "1", NodesPerString: "50", WorldPosX: "-250", WorldPosY: "250", ScaleX: "1.6", ScaleY: "1.6" }],
];

interface Placed {
  type: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

function placeYard(): Placed[] {
  return YARD.map(([type, attrs]) => {
    const g = computeGeometryFromAttrs(type, attrs);
    if (!g) throw new Error(`no geometry for ${type}`);
    const s = screenFromAttrs(type, attrs, g, SPACING);
    const half = transformedHalfExtents(g, { scale: s.scale, scaleY: s.scaleY, rotateDeg: s.rotate });
    const halfW = half.halfW * SPACING;
    const halfH = half.halfH * SPACING;
    return {
      type,
      minX: s.x - halfW,
      maxX: s.x + halfW,
      minY: s.y - halfH,
      maxY: s.y + halfH,
      area: Math.max(halfW * 2, 1) * Math.max(halfH * 2, 1),
    };
  });
}

describe("an imported yard lays out like a yard", () => {
  const placed = placeYard();
  const minX = Math.min(...placed.map((p) => p.minX));
  const maxX = Math.max(...placed.map((p) => p.maxX));
  const minY = Math.min(...placed.map((p) => p.minY));
  const maxY = Math.max(...placed.map((p) => p.maxY));
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  it("has a yard-shaped bounding box, not a tower", () => {
    // A real front yard is roughly landscape-to-square. The pre-fix version came out 1:2.6
    // tall because one model's scale was inflated by the local-unit factor.
    const aspect = spanX / spanY;
    expect(aspect, `span was ${Math.round(spanX)} x ${Math.round(spanY)}`).toBeGreaterThan(0.5);
    expect(aspect, `span was ${Math.round(spanX)} x ${Math.round(spanY)}`).toBeLessThan(4);
  });

  it("has no single model swallowing the whole layout", () => {
    const total = spanX * spanY;
    for (const p of placed) {
      expect(p.area / total, `${p.type} covered ${((p.area / total) * 100).toFixed(0)}% of the layout`).toBeLessThan(0.6);
    }
  });

  it("keeps models spread out rather than stacked on one spot", () => {
    // Every model's centre should be distinct - a collapse to a single anchor is what
    // "everything piled in the middle" looks like numerically.
    const centres = placed.map((p) => `${Math.round((p.minX + p.maxX) / 2)},${Math.round((p.minY + p.maxY) / 2)}`);
    expect(new Set(centres).size).toBe(placed.length);
  });

  it("puts two-point models where their endpoints say, spanning their full run", () => {
    const roofline = placed.find((p) => p.type === "Single Line")!;
    // declared run: (-60,215) -> (200,255)
    expect((roofline.minX + roofline.maxX) / 2).toBeCloseTo(70, 0);
    expect(roofline.maxX - roofline.minX).toBeCloseTo(260, -1);
  });
});

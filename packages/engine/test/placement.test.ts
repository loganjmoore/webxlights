import { describe, expect, it } from "vitest";
import { appliedPlacementFor, placementSystemFor, screenFromAttrs } from "../src/models/placement";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import type { ModelGeometry } from "../src/models/types";
import { transformedHalfExtents } from "../src/models/transform";

const SPACING = 4; // the canvases' NODE_SPACING

// computeGeometryFromAttrs returns null for a type it can't build; every type used here is
// supported, so a null means the test's own setup is wrong and should fail loudly.
function geo(type: string, attrs: Record<string, string> = {}): ModelGeometry {
  const g = computeGeometryFromAttrs(type, attrs);
  if (!g) throw new Error(`no geometry for "${type}"`);
  return g;
}

// World width a model actually occupies once placed - the number that has to match the span
// xLights recorded between the model's two endpoints.
function renderedWidth(g: ModelGeometry, scale: number): number {
  return transformedHalfExtents(g, { scale, scaleY: scale, rotateDeg: 0 }).halfW * 2 * SPACING;
}

describe("xLights placement systems (SPEC ch11 §2.1)", () => {
  it("maps each model type to the screen location class xLights uses for it", () => {
    expect(placementSystemFor("Matrix")).toBe("boxed");
    expect(placementSystemFor("Tree")).toBe("boxed");
    expect(placementSystemFor("Custom")).toBe("boxed");
    expect(placementSystemFor("Single Line")).toBe("twoPoint");
    expect(placementSystemFor("Icicles")).toBe("threePoint"); // three handles: start, end, shear
    expect(placementSystemFor("Arches")).toBe("threePoint");
    expect(placementSystemFor("Candy Canes")).toBe("threePoint");
    // Poly Line has its own system: the vertex list is the shape, so it is neither boxed nor
    // two-point math with extra points (see polyPoints.test.ts).
    expect(placementSystemFor("Poly Line")).toBe("polyLine");
  });

  it("a boxed model keeps WorldPos as its centre and takes Scale/Rotate at face value", () => {
    const screen = screenFromAttrs(
      "Matrix",
      { WorldPosX: "100", WorldPosY: "50", WorldPosZ: "7", ScaleX: "2", ScaleY: "3", RotateZ: "45" },
      geo("Matrix"),
      SPACING,
    );
    // ScaleX/Y are xLights' node-unit render multipliers; ours multiply local units that are
    // then drawn at SPACING px each, so they divide through by it (see placement.ts).
    expect(screen).toMatchObject({ x: 100, y: 50, z: 7, scale: 2 / SPACING, scaleY: 3 / SPACING, rotate: 45 });
  });

  it("a two-point model anchors on the midpoint of its endpoints, not on one end", () => {
    // roofline running from (100,200) to (400,200)
    const screen = screenFromAttrs(
      "Single Line",
      { WorldPosX: "100", WorldPosY: "200", X2: "300", Y2: "0" },
      geo("Single Line"),
      SPACING,
    );
    expect(screen.x).toBeCloseTo(250); // midpoint, not 100
    expect(screen.y).toBeCloseTo(200);
    expect(screen.rotate).toBeCloseTo(0);
  });

  it("a two-point model is scaled to actually span its endpoint vector", () => {
    const g = geo("Single Line");
    const screen = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "300", Y2: "0" }, g, SPACING);
    expect(renderedWidth(g, screen.scale)).toBeCloseTo(300, 4);
  });

  it("a two-point model takes its angle from the endpoint vector", () => {
    const g = geo("Single Line");
    const up = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "0", Y2: "100" }, g, SPACING);
    expect(up.rotate).toBeCloseTo(90);

    const diagonal = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "100", Y2: "100" }, g, SPACING);
    expect(diagonal.rotate).toBeCloseTo(45);
    // the span is the diagonal's own length, not its X component
    expect(renderedWidth(g, diagonal.scale)).toBeCloseTo(Math.hypot(100, 100), 4);
  });

  it("a backwards endpoint vector mirrors the model instead of turning it over", () => {
    // A half turn puts the model on the same line either way, so for a symmetric shape it looks
    // fine - but it also flips the perpendicular axis, and that is what turned a right-to-left
    // arch into a bowl. The mirror keeps the same line and the same node order along it.
    const g = geo("Single Line");
    const screen = screenFromAttrs("Single Line", { WorldPosX: "400", WorldPosY: "0", X2: "-300", Y2: "0" }, g, SPACING);
    expect(screen.x).toBeCloseTo(250);
    expect(screen.rotate).toBeCloseTo(0);
    expect(screen.scale).toBeLessThan(0); // mirrored along its own X
    expect(renderedWidth(g, screen.scale)).toBeCloseTo(300, 4);
    expect(screen.scaleY).toBeGreaterThan(0); // ...but never along Y
  });

  it("Z is carried through the midpoint too", () => {
    const screen = screenFromAttrs(
      "Single Line",
      { WorldPosX: "0", WorldPosY: "0", WorldPosZ: "10", X2: "100", Y2: "0", Z2: "20" },
      geo("Single Line"),
      SPACING,
    );
    expect(screen.z).toBeCloseTo(20); // 10 + 20/2
  });

  it("a three-point model's Height scales the perpendicular axis by a multiple of its length", () => {
    const g = geo("Arches", { NumArches: "5", NodesPerArch: "20" });
    const tall = screenFromAttrs("Arches", { WorldPosX: "0", WorldPosY: "0", X2: "200", Y2: "0", Height: "1" }, g, SPACING);
    const flat = screenFromAttrs("Arches", { WorldPosX: "0", WorldPosY: "0", X2: "200", Y2: "0", Height: "0.5" }, g, SPACING);

    expect(tall.scale).toBeCloseTo(flat.scale); // same span either way
    expect(tall.scaleY).toBeCloseTo((flat.scaleY ?? 0) * 2); // half the height, half the Y scale

    const renderedHeight = transformedHalfExtents(g, { scale: tall.scale, scaleY: tall.scaleY, rotateDeg: 0 }).halfH * 2 * SPACING;
    expect(renderedHeight).toBeCloseTo(200, 4); // Height 1 == as tall as it is wide
  });

  it("a three-point model with no Height keeps its own proportions", () => {
    // Defaulting Height to 1 would make a run of icicles as deep as it is wide.
    const g = geo("Icicles", { NumStrings: "1", NodesPerString: "60" });
    const screen = screenFromAttrs("Icicles", { WorldPosX: "0", WorldPosY: "0", X2: "250", Y2: "0" }, g, SPACING);
    expect(screen.scaleY).toBeCloseTo(screen.scale);
  });

  // Reported from a real show: "the arches look upside down". A run drawn right-to-left has a
  // backwards endpoint vector, and turning the model through that angle turned the arc over.
  it("an arch rises to the same side whichever end it was anchored from", () => {
    const g = geo("Arches", { NumArches: "3", NodesPerArch: "20" });
    const forward = screenFromAttrs("Arches", { WorldPosX: "200", WorldPosY: "120", X2: "200", Y2: "0", Height: "0.5" }, g, SPACING);
    const backward = screenFromAttrs("Arches", { WorldPosX: "400", WorldPosY: "120", X2: "-200", Y2: "0", Height: "0.5" }, g, SPACING);

    expect(backward.x).toBeCloseTo(forward.x); // same span of yard
    expect(Math.sign(backward.scaleY!)).toBe(Math.sign(forward.scaleY!)); // and the same way up
    expect(backward.scaleY).toBeCloseTo(forward.scaleY!);
  });

  it("a candy cane hooks the same way whichever end it was anchored from", () => {
    const g = geo("Candy Canes", { NumCanes: "4", NodesPerCane: "18" });
    const forward = screenFromAttrs("Candy Canes", { WorldPosX: "0", WorldPosY: "0", X2: "160", Y2: "0", Height: "0.6" }, g, SPACING);
    const backward = screenFromAttrs("Candy Canes", { WorldPosX: "160", WorldPosY: "0", X2: "-160", Y2: "0", Height: "0.6" }, g, SPACING);
    expect(Math.sign(backward.scaleY!)).toBe(Math.sign(forward.scaleY!));
  });

  it("still lets a negative Height turn the arc over, because that sign is deliberate", () => {
    // xLights' third handle can be dragged below the line. That is the one thing that should
    // flip the arc - the direction the run happens to be drawn in is not.
    const g = geo("Arches", { NumArches: "3", NodesPerArch: "20" });
    const up = screenFromAttrs("Arches", { WorldPosX: "0", WorldPosY: "0", X2: "200", Y2: "0", Height: "0.5" }, g, SPACING);
    const down = screenFromAttrs("Arches", { WorldPosX: "0", WorldPosY: "0", X2: "200", Y2: "0", Height: "-0.5" }, g, SPACING);
    expect(Math.sign(down.scaleY!)).toBe(-Math.sign(up.scaleY!));
  });

  it("a model running up-and-to-the-left keeps its angle rather than snapping flat", () => {
    // The fold is only a half turn, so a diagonal stays diagonal - 135 degrees becomes -45 with
    // a mirror, which is the same line.
    const g = geo("Single Line");
    const screen = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "-100", Y2: "100" }, g, SPACING);
    expect(screen.rotate).toBeCloseTo(-45);
    expect(renderedWidth(g, screen.scale)).toBeCloseTo(Math.hypot(100, 100), 4);
  });

  it("a missing endpoint vector falls back to the boxed reading instead of collapsing", () => {
    // Real shows contain models saved before an endpoint was ever set; scale 0 would make them
    // invisible and un-clickable, which reads as "the import dropped it".
    const screen = screenFromAttrs("Single Line", { WorldPosX: "10", WorldPosY: "20", ScaleX: "3", RotateZ: "15" }, geo("Single Line"), SPACING);
    expect(screen).toMatchObject({ x: 10, y: 20, scale: 3 / SPACING, rotate: 15 });
  });

  it("an unsupported model with no geometry still gets a usable position", () => {
    const screen = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "100", Y2: "0" }, null, SPACING);
    expect(screen.x).toBeCloseTo(50);
    expect(Number.isFinite(screen.scale)).toBe(true);
  });

  it("attributes that aren't present don't invent values", () => {
    const screen = screenFromAttrs("Matrix", {}, geo("Matrix"), SPACING);
    expect(screen).toMatchObject({ x: 0, y: 0, z: 0, scale: 1 / SPACING, rotate: 0 });
    expect(screen.scaleY).toBeUndefined(); // absent ScaleY stays uniform, it doesn't become 1
  });
});

// The invariant that was broken, and the reason an imported show came out as a pile of
// overlapping props at wildly different sizes: xLights' ScaleX means the same thing whatever
// the model type, so two models with the same ScaleX and the same node count must end up
// roughly the same size on our canvas too. Ring types (Circle/Star/Wreath) used to normalize
// to a fixed 2-unit shape, so they came out ~25x smaller than a matrix of the same node count.
describe("cross-type size consistency", () => {
  const NODES = 50;

  function worldWidth(type: string, attrs: Record<string, string>): number {
    const g = geo(type, attrs);
    const screen = screenFromAttrs(type, { ScaleX: "1", ...attrs }, g, SPACING);
    return transformedHalfExtents(g, { scale: screen.scale, scaleY: screen.scaleY, rotateDeg: 0 }).halfW * 2 * SPACING;
  }

  it("a ring model and a line model of the same node count land within a small factor", () => {
    const line = worldWidth("Single Line", { NumStrings: "1", NodesPerString: String(NODES) });
    const circle = worldWidth("Circle", { NumStrings: "1", NodesPerString: String(NODES) });
    // a ring of N nodes is N/pi across vs a line's N - about a third, not a twenty-fifth
    expect(circle).toBeGreaterThan(line / 5);
    expect(circle).toBeLessThan(line * 5);
  });

  it("every supported type stays within one order of magnitude at the same ScaleX", () => {
    const widths: Array<[string, number]> = [
      ["Matrix", worldWidth("Matrix", { NumStrings: "50", NodesPerString: "50" })],
      ["Single Line", worldWidth("Single Line", { NumStrings: "1", NodesPerString: "50" })],
      ["Circle", worldWidth("Circle", { NumStrings: "1", NodesPerString: "50" })],
      ["Star", worldWidth("Star", { NumStrings: "1", NodesPerString: "50" })],
      ["Wreath", worldWidth("Wreath", { NumStrings: "1", NodesPerString: "50" })],
      ["Tree", worldWidth("Tree", { NumStrings: "16", NodesPerString: "50" })],
    ];
    const values = widths.map(([, w]) => w);
    const ratio = Math.max(...values) / Math.max(Math.min(...values), 1e-9);
    expect(ratio, `sizes were ${widths.map(([t, w]) => `${t}=${w.toFixed(1)}`).join(", ")}`).toBeLessThan(10);
  });

  it("a ring's size tracks its node count", () => {
    const small = worldWidth("Circle", { NumStrings: "1", NodesPerString: "20" });
    const big = worldWidth("Circle", { NumStrings: "1", NodesPerString: "200" });
    expect(big).toBeGreaterThan(small * 5);
  });
});

// The endpoint attribute names are the one part of this not confirmed against a real xLights
// file. These make the uncertainty visible instead of silent: spelling variants are accepted,
// and appliedPlacementFor reports what a model actually resolved to so an import can say
// "0 two-point models" when the guess is wrong for a given show.
describe("placement reporting and attribute tolerance", () => {
  it("reports the system a model actually resolved to", () => {
    expect(appliedPlacementFor("Matrix", { WorldPosX: "1" })).toBe("boxed");
    expect(appliedPlacementFor("Single Line", { X2: "100", Y2: "0" })).toBe("twoPoint");
    expect(appliedPlacementFor("Arches", { X2: "100", Y2: "0" })).toBe("threePoint");
  });

  it("reports boxed when a two/three-point model has no usable endpoint vector", () => {
    // This is the signal: a show full of arches reporting "boxed" means the endpoint
    // attributes aren't named what we expect in that file.
    expect(appliedPlacementFor("Arches", { WorldPosX: "10", ScaleX: "2" })).toBe("boxed");
    expect(appliedPlacementFor("Single Line", { X2: "0", Y2: "0" })).toBe("boxed");
  });

  it("accepts lowercase endpoint attributes as well as capitalised ones", () => {
    const upper = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "300", Y2: "0" }, geo("Single Line"), SPACING);
    const lower = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", x2: "300", y2: "0" }, geo("Single Line"), SPACING);
    expect(lower.x).toBeCloseTo(upper.x);
    expect(lower.scale).toBeCloseTo(upper.scale);
    expect(appliedPlacementFor("Single Line", { x2: "300", y2: "0" })).toBe("twoPoint");
  });
});

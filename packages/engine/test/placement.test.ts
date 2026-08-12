import { describe, expect, it } from "vitest";
import { placementSystemFor, screenFromAttrs } from "../src/models/placement";
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
    expect(placementSystemFor("Icicles")).toBe("twoPoint");
    expect(placementSystemFor("Arches")).toBe("threePoint");
    expect(placementSystemFor("Candy Canes")).toBe("threePoint");
    // Poly Line's own PolyPointScreenLocation isn't implemented - it must fall back to boxed,
    // not get silently run through the two-point math.
    expect(placementSystemFor("Poly Line")).toBe("boxed");
  });

  it("a boxed model keeps WorldPos as its centre and takes Scale/Rotate at face value", () => {
    const screen = screenFromAttrs(
      "Matrix",
      { WorldPosX: "100", WorldPosY: "50", WorldPosZ: "7", ScaleX: "2", ScaleY: "3", RotateZ: "45" },
      geo("Matrix"),
      SPACING,
    );
    expect(screen).toMatchObject({ x: 100, y: 50, z: 7, scale: 2, scaleY: 3, rotate: 45 });
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

  it("a negative endpoint vector points the model the other way", () => {
    const screen = screenFromAttrs("Single Line", { WorldPosX: "400", WorldPosY: "0", X2: "-300", Y2: "0" }, geo("Single Line"), SPACING);
    expect(screen.x).toBeCloseTo(250);
    expect(Math.abs(screen.rotate)).toBeCloseTo(180);
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

  it("a missing endpoint vector falls back to the boxed reading instead of collapsing", () => {
    // Real shows contain models saved before an endpoint was ever set; scale 0 would make them
    // invisible and un-clickable, which reads as "the import dropped it".
    const screen = screenFromAttrs("Single Line", { WorldPosX: "10", WorldPosY: "20", ScaleX: "3", RotateZ: "15" }, geo("Single Line"), SPACING);
    expect(screen).toMatchObject({ x: 10, y: 20, scale: 3, rotate: 15 });
  });

  it("an unsupported model with no geometry still gets a usable position", () => {
    const screen = screenFromAttrs("Single Line", { WorldPosX: "0", WorldPosY: "0", X2: "100", Y2: "0" }, null, SPACING);
    expect(screen.x).toBeCloseTo(50);
    expect(Number.isFinite(screen.scale)).toBe(true);
  });

  it("attributes that aren't present don't invent values", () => {
    const screen = screenFromAttrs("Matrix", {}, geo("Matrix"), SPACING);
    expect(screen).toMatchObject({ x: 0, y: 0, z: 0, scale: 1, rotate: 0 });
    expect(screen.scaleY).toBeUndefined(); // absent ScaleY stays uniform, it doesn't become 1
  });
});

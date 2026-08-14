import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import {
  acrossAt,
  colorCurveAt,
  hasSpatialCurve,
  hexToRgbaColor,
  isColorCurve,
  resolvePalette,
  sampleCountFor,
  spatialAxisFor,
  type ColorCurve,
} from "../src/colorCurve";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowSequencer, renderRowAtMs, type RenderableEffect } from "../src/renderFrame";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

function curve(over: Partial<ColorCurve> = {}): ColorCurve {
  return {
    kind: "colorCurve",
    mode: "Time",
    blend: "Gradient",
    points: [
      { x: 0, color: "#ff0000" },
      { x: 1, color: "#0000ff" },
    ],
    ...over,
  };
}

describe("Color curves (manual: a colour that changes within an effect)", () => {
  it("reads hex the way the sequence body stores it, short form included", () => {
    expect(hexToRgbaColor("#ff0000")).toEqual(RED);
    expect(hexToRgbaColor("f00")).toEqual(RED);
    expect(hexToRgbaColor("nonsense")).toEqual(rgba(255, 255, 255, 255));
  });

  it("blends between markers on Gradient", () => {
    const c = curve();
    expect(colorCurveAt(c, 0)).toEqual(RED);
    expect(colorCurveAt(c, 1)).toEqual(BLUE);
    const middle = colorCurveAt(c, 0.5);
    expect(middle.r).toBeCloseTo(128, -1);
    expect(middle.b).toBeCloseTo(128, -1);
  });

  it("holds each marker's colour until the next on None, which is the sharp change", () => {
    const c = curve({ blend: "None" });
    expect(colorCurveAt(c, 0.5)).toEqual(RED);
    expect(colorCurveAt(c, 0.99)).toEqual(RED);
    expect(colorCurveAt(c, 1)).toEqual(BLUE);
  });

  it("holds the end colours outside the marker range rather than fading to nothing", () => {
    const c = curve({ points: [{ x: 0.25, color: "#ff0000" }, { x: 0.75, color: "#0000ff" }] });
    expect(colorCurveAt(c, 0)).toEqual(RED);
    expect(colorCurveAt(c, 1)).toEqual(BLUE);
  });

  it("sorts its markers, so one dragged past its neighbour doesn't run the curve backwards", () => {
    const c = curve({ points: [{ x: 1, color: "#0000ff" }, { x: 0, color: "#ff0000" }] });
    expect(colorCurveAt(c, 0)).toEqual(RED);
    expect(colorCurveAt(c, 1)).toEqual(BLUE);
  });

  it("survives an empty or single-marker curve rather than throwing", () => {
    expect(colorCurveAt(curve({ points: [] }), 0.5)).toEqual(rgba(255, 255, 255, 255));
    expect(colorCurveAt(curve({ points: [{ x: 0.5, color: "#00ff00" }] }), 0)).toEqual(rgba(0, 255, 0, 255));
  });

  it("tells a curve from a plain colour", () => {
    expect(isColorCurve(curve())).toBe(true);
    expect(isColorCurve(RED)).toBe(false);
    expect(isColorCurve(null)).toBe(false);
  });
});

describe("resolving a palette", () => {
  it("collapses a time curve at the moment asked for, leaving plain swatches alone", () => {
    const resolved = resolvePalette([RED, curve()], 1);
    expect(resolved[0]).toEqual(RED);
    expect(resolved[1]).toEqual(BLUE);
  });

  it("reads a spatial curve by position across the model, not by time", () => {
    const spatial = curve({ mode: "Spatial" });
    // Time is at the start, position is at the end: a spatial curve must follow the position.
    expect(resolvePalette([spatial], 0, 1)[0]).toEqual(BLUE);
    expect(resolvePalette([spatial], 1, 0)[0]).toEqual(RED);
  });

  it("knows which axis a spatial palette runs along, and picks one when swatches disagree", () => {
    expect(hasSpatialCurve([RED])).toBe(false);
    expect(hasSpatialCurve([RED, curve({ mode: "Spatial" })])).toBe(true);

    const axis = spatialAxisFor([
      curve({ mode: "Spatial", direction: "Bottom to Top", blend: "None" }),
      curve({ mode: "Spatial", direction: "Left to Right" }),
    ]);
    // A buffer can only be sampled along one axis at a time, so the first spatial swatch wins -
    // rendering half the palette along the wrong axis would be worse than choosing.
    expect(axis).toEqual({ direction: "Bottom to Top", blend: "None" });
  });

  it("maps a buffer cell onto the axis, in each direction", () => {
    expect(acrossAt("Left to Right", 0, 0, 5, 5)).toBe(0);
    expect(acrossAt("Left to Right", 4, 0, 5, 5)).toBe(1);
    expect(acrossAt("Right to Left", 0, 0, 5, 5)).toBe(1);
    expect(acrossAt("Bottom to Top", 0, 4, 5, 5)).toBe(1);
    expect(acrossAt("Top to Bottom", 0, 4, 5, 5)).toBe(0);
    expect(acrossAt("Left to Right", 0, 0, 1, 1)).toBe(0); // a one-cell buffer has no axis
  });

  it("costs nothing extra when no swatch is spatial", () => {
    expect(sampleCountFor([RED, curve()])).toBe(1);
    expect(sampleCountFor([curve({ mode: "Spatial" })])).toBeGreaterThan(1);
  });

  it("caps how many times a spatial layer is rendered", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i / 39, color: "#ff0000" }));
    expect(sampleCountFor([curve({ mode: "Spatial", points: many })])).toBeLessThanOrEqual(8);
  });
});

describe("a colour curve through the render pipeline", () => {
  const geometry = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
  const onParams = { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false };

  it("changes an effect's colour over its own duration", () => {
    // The point of the feature: "where previously the same color value would have been displayed
    // for a particular segment duration it can now be made to change within that segment."
    const effect: RenderableEffect = { name: "On", startMs: 0, endMs: 1000, params: onParams, palette: [curve()] };
    const start = renderRowAtMs({ geometry, effects: [effect] }, 0, 50, 1, [RED]);
    const end = renderRowAtMs({ geometry, effects: [effect] }, 999, 50, 1, [RED]);
    expect(start[0]!.r).toBeGreaterThan(start[0]!.b);
    expect(end[0]!.b).toBeGreaterThan(end[0]!.r);
  });

  it("changes an effect's colour across the model, within one frame", () => {
    // A spatial curve is the one that can't be collapsed before the effect runs: at a single
    // moment the swatch is a different colour at each end of the prop.
    const effect: RenderableEffect = {
      name: "On",
      startMs: 0,
      endMs: 1000,
      params: onParams,
      palette: [curve({ mode: "Spatial", direction: "Left to Right" })],
    };
    const colors = renderRowAtMs({ geometry, effects: [effect] }, 500, 50, 1, [RED]);
    const left = geometry.nodes.findIndex((n) => n.bufX === 0);
    const right = geometry.nodes.findIndex((n) => n.bufX === geometry.width - 1);
    expect(colors[left]!.r).toBeGreaterThan(colors[right]!.r);
    expect(colors[right]!.b).toBeGreaterThan(colors[left]!.b);
  });

  it("runs the spatial curve the other way when told to", () => {
    const reversed: RenderableEffect = {
      name: "On",
      startMs: 0,
      endMs: 1000,
      params: onParams,
      palette: [curve({ mode: "Spatial", direction: "Right to Left" })],
    };
    const colors = renderRowAtMs({ geometry, effects: [reversed] }, 500, 50, 1, [RED]);
    const left = geometry.nodes.findIndex((n) => n.bufX === 0);
    const right = geometry.nodes.findIndex((n) => n.bufX === geometry.width - 1);
    expect(colors[right]!.r).toBeGreaterThan(colors[left]!.r);
  });

  it("renders the same through the sequential export path as through a scrub", () => {
    // Colour curves change what every frame looks like, so a disagreement between the two paths
    // would ship a preview that doesn't match the exported .fseq.
    const effects: RenderableEffect[] = [
      { name: "On", startMs: 0, endMs: 1000, params: onParams, palette: [curve()] },
      { name: "Bars", startMs: 0, endMs: 1000, params: { paletteRep: 1, cycles: 2, direction: "up", centerPercent: 0, highlight: false }, palette: [curve({ mode: "Spatial" }), BLUE], blendMode: "Additive" },
    ];
    const sequencer = createRowSequencer({ geometry, effects }, 50, 1, [RED]);
    for (let f = 0; f < 12; f++) {
      const atMs = f * 50;
      expect(sequencer.renderFrameAt(atMs)).toEqual(renderRowAtMs({ geometry, effects }, atMs, 50, 1, [RED]));
    }
  });

  it("leaves an ordinary palette rendering exactly as it did before", () => {
    const effect: RenderableEffect = { name: "On", startMs: 0, endMs: 1000, params: onParams, palette: [RED] };
    expect(renderRowAtMs({ geometry, effects: [effect] }, 500, 50, 1, [BLUE])[0]).toEqual(RED);
  });
});

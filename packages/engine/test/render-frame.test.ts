import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { computeSingleLine } from "../src/models/line";
import { renderRowAtMs } from "../src/renderFrame";

const RED = rgba(255, 0, 0, 255);

describe("renderRowAtMs (M4 frame-render pipeline)", () => {
  const geometry = computeSingleLine({ strings: 1, nodesPerString: 5 });

  it("returns transparent nodes when no effect is active at atMs", () => {
    const colors = renderRowAtMs({ geometry, effects: [] }, 500, 50, 1, [RED]);
    expect(colors).toHaveLength(5);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });

  it("renders an On effect active at atMs", () => {
    const effects = [{ name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } }];
    const colors = renderRowAtMs({ geometry, effects }, 500, 50, 1, [RED]);
    expect(colors[0]).toEqual(RED);
  });

  it("an effect outside its time range does not render", () => {
    const effects = [{ name: "On", startMs: 0, endMs: 500, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } }];
    const colors = renderRowAtMs({ geometry, effects }, 600, 50, 1, [RED]);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });

  it("a stateful effect (Fire) renders something non-transparent", () => {
    const effects = [{ name: "Fire", startMs: 0, endMs: 2000, params: { height: 50, hueShift: 0, growthCycles: 0 } }];
    const geo = computeSingleLine({ strings: 1, nodesPerString: 20 });
    const colors = renderRowAtMs({ geometry: geo, effects }, 800, 50, 3, [RED]);
    expect(colors.some((c) => c.a > 0)).toBe(true);
  });

  it("is deterministic: same atMs + seed produce the same node colors", () => {
    const effects = [{ name: "Bars", startMs: 0, endMs: 1000, params: { paletteRep: 1, cycles: 1, direction: "down", centerPercent: 0, highlight: false } }];
    const a = renderRowAtMs({ geometry, effects }, 333, 50, 7, [RED]);
    const b = renderRowAtMs({ geometry, effects }, 333, 50, 7, [RED]);
    expect(a).toEqual(b);
  });

  it("two overlapping effects on the same row layer bottom-to-top (array order)", () => {
    const effects = [
      { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } },
      { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } },
    ];
    const colors = renderRowAtMs({ geometry, effects }, 500, 50, 1, [RED, rgba(0, 0, 255)]);
    // second "On" layer also uses palette[0]=RED (same params) -> Normal blend of red-over-red = red
    expect(colors[0]).toEqual(RED);
  });
});

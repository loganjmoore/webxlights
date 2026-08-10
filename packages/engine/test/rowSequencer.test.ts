import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowSequencer, renderRowAtMs, type RenderableEffect } from "../src/renderFrame";
import type { RGBA } from "../src/color";

describe("createRowSequencer", () => {
  const geometry = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
  const frameMs = 50;
  const palette: RGBA[] = [
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
  ];

  it("matches renderRowAtMs frame-by-frame for a stateful effect (Meteors)", () => {
    const effects: RenderableEffect[] = [{ name: "Meteors", startMs: 0, endMs: 1000, params: { count: 5, trailLength: 10, speed: 5 } }];
    const sequencer = createRowSequencer({ geometry, effects }, frameMs, 42, palette);

    for (let f = 0; f < 20; f++) {
      const atMs = f * frameMs;
      const expected = renderRowAtMs({ geometry, effects }, atMs, frameMs, 42, palette);
      const actual = sequencer.renderFrameAt(atMs);
      expect(actual).toEqual(expected);
    }
  });

  it("matches renderRowAtMs for a mix of stateless + stateful layers", () => {
    const effects: RenderableEffect[] = [
      { name: "ColorWash", startMs: 0, endMs: 1000, params: { cycles: 2 } },
      { name: "Fire", startMs: 200, endMs: 800, params: { height: 50, hueShift: 0, growthCycles: 0 } },
    ];
    const sequencer = createRowSequencer({ geometry, effects }, frameMs, 7, palette);

    for (let f = 0; f < 20; f++) {
      const atMs = f * frameMs;
      const expected = renderRowAtMs({ geometry, effects }, atMs, frameMs, 7, palette);
      const actual = sequencer.renderFrameAt(atMs);
      expect(actual).toEqual(expected);
    }
  });

  it("returns transparent frames when nothing is active", () => {
    const effects: RenderableEffect[] = [{ name: "Strobe", startMs: 500, endMs: 600, params: {} }];
    const sequencer = createRowSequencer({ geometry, effects }, frameMs, 1, palette);
    const frame = sequencer.renderFrameAt(0);
    expect(frame.every((p) => p.a === 0)).toBe(true);
  });
});

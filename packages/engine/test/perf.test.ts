import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowSequencer, type RenderableEffect } from "../src/renderFrame";
import type { RGBA } from "../src/color";

// ROADMAP.md perf budget: "medium show = 20k channels, 3 min, 50ms frames: full render
// <=60s on 4-core laptop". This is the single-threaded engine-only slice of that budget
// (no worker pool yet - see DECISIONS.md M4 notes); it's the honest number to report since
// it's what actually runs today, and it's a real regression guard, not a one-off measurement.
describe("perf: medium show render budget", () => {
  it("renders ~20k channels x 3600 frames within the ROADMAP budget", () => {
    const geometry = computeVerticalMatrixTopLeft({ strings: 82, nodesPerString: 82 }); // 6724 nodes = 20172 channels
    const frameMs = 50;
    const durationMs = 3 * 60 * 1000;
    const frameCount = Math.ceil(durationMs / frameMs);
    const palette: RGBA[] = [
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
    ];

    // A representative mixed layer stack: two stateless effects overlapping the full
    // timeline plus a stateful one (the most expensive kind - see renderFrame.ts's
    // STATEFUL_EFFECTS replay-from-start note), matching real multi-layer sequencing.
    const effects: RenderableEffect[] = [
      { name: "ColorWash", startMs: 0, endMs: durationMs, params: { cycles: 3 } },
      { name: "Twinkle", startMs: 0, endMs: durationMs, params: { countPct: 10, steps: 30 } },
      { name: "Meteors", startMs: 0, endMs: durationMs, params: { count: 10, trailLength: 25, speed: 10 } },
    ];

    const sequencer = createRowSequencer({ geometry, effects }, frameMs, 12345, palette);
    const started = performance.now();
    for (let f = 0; f < frameCount; f++) {
      sequencer.renderFrameAt(f * frameMs);
    }
    const elapsedMs = performance.now() - started;

    console.log(`perf: ${frameCount} frames x ${geometry.nodes.length} nodes in ${elapsedMs.toFixed(0)}ms`);
    expect(elapsedMs).toBeLessThan(60_000);
  }, 65_000);
});

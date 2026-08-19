import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft, defaultParamsFor, renderRowAtMs, type RenderableEffect } from "../src/index";

const PALETTE = [
  { r: 255, g: 0, b: 0, a: 255 },
  { r: 0, g: 0, b: 255, a: 255 },
];
const matrix = computeVerticalMatrixTopLeft({ strings: 12, nodesPerString: 12 });

/**
 * Effects whose whole animation comes from `frameIndexInEffect`.
 *
 * That field was hardcoded to 0 in the stateless render path, so every one of these rendered the
 * same frame forever - in the preview and in an exported .fseq alike - while still producing
 * plausible output, which is why the existing "does it render something" test never noticed. A
 * Butterfly that never moves is what it looked like from the outside.
 */
const TIME_DRIVEN = ["Butterfly", "Wave", "Pinwheel", "Spirograph", "Tree", "Lines", "Candle", "Twinkle"];

function frameAt(name: string, atMs: number) {
  const effect: RenderableEffect = { name, startMs: 0, endMs: 10000, params: defaultParamsFor(name) };
  return renderRowAtMs({ geometry: matrix, effects: [effect] }, atMs, 50, 42, PALETTE);
}

describe("effects that are supposed to move actually move", () => {
  for (const name of TIME_DRIVEN) {
    it(`${name} renders a different frame later in the effect`, () => {
      const early = frameAt(name, 200);
      const later = frameAt(name, 3000);
      const changed = early.some((c, i) => {
        const other = later[i]!;
        return c.r !== other.r || c.g !== other.g || c.b !== other.b || c.a !== other.a;
      });
      expect(changed, `${name} rendered an identical frame at 200ms and 3000ms`).toBe(true);
    });
  }

  it("keeps drawing on every frame rather than blinking out", () => {
    // Pinwheel's arms are about a degree wide at the default thickness, and this tests each
    // pixel's angle rather than drawing the arm as a line - so without a floor on that width the
    // arms fall between pixels and the wheel vanishes for two frames in every three.
    for (let ms = 0; ms <= 1000; ms += 50) {
      expect(frameAt("Pinwheel", ms).some((c) => c.a > 0), `Pinwheel was blank at ${ms}ms`).toBe(true);
    }
  });
});

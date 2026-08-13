import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { TRANSITION_TYPES, applyTransitions, transitionProgress, type TransitionType } from "../src/transition";

const EFFECT = { startMs: 0, endMs: 1000 };

function filled(w = 16, h = 16): RenderBuffer {
  const buf = new RenderBuffer(w, h);
  buf.fill(rgba(255, 255, 255, 255));
  return buf;
}

function litCount(buf: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (buf.getPixel(x, y).a > 0) n++;
  return n;
}

function revealAt(type: TransitionType, atMs: number, w = 16, h = 16): RenderBuffer {
  const buf = filled(w, h);
  applyTransitions(buf, EFFECT, atMs, { inType: type, inDurationMs: 1000 });
  return buf;
}

describe("Transition system (SPEC ch9 layer transitions)", () => {
  it("every transition hides everything at progress 0 and reveals everything at progress 1", () => {
    for (const type of TRANSITION_TYPES) {
      expect(litCount(revealAt(type, 0)), `${type} at start`).toBe(0);
      expect(litCount(revealAt(type, 1000)), `${type} at end`).toBe(16 * 16);
    }
  });

  it("every transition reveals monotonically more of the buffer as it progresses", () => {
    for (const type of TRANSITION_TYPES) {
      let previous = -1;
      for (let ms = 0; ms <= 1000; ms += 100) {
        const lit = litCount(revealAt(type, ms));
        expect(lit, `${type} went backwards at ${ms}ms`).toBeGreaterThanOrEqual(previous);
        previous = lit;
      }
    }
  });

  it("Wipe sweeps left to right, and reverse sweeps the other way", () => {
    const half = revealAt("Wipe", 500);
    expect(half.getPixel(0, 8).a).toBe(255); // left edge is in
    expect(half.getPixel(15, 8).a).toBe(0); // right edge is not

    const reversed = filled();
    applyTransitions(reversed, EFFECT, 500, { inType: "Wipe", inDurationMs: 1000, inReverse: true });
    expect(reversed.getPixel(0, 8).a).toBe(0);
    expect(reversed.getPixel(15, 8).a).toBe(255);
  });

  it("Circle Explode reveals the centre before the corners, Circle Implode the reverse", () => {
    const explode = revealAt("Circle Explode", 300);
    expect(explode.getPixel(8, 8).a).toBeGreaterThan(0);
    expect(explode.getPixel(0, 0).a).toBe(0);

    const implode = revealAt("Circle Implode", 300);
    expect(implode.getPixel(0, 0).a).toBeGreaterThan(0);
    expect(implode.getPixel(8, 8).a).toBe(0);
  });

  it("From Middle grows out from the centre columns", () => {
    const buf = revealAt("From Middle", 300);
    expect(buf.getPixel(8, 3).a).toBeGreaterThan(0);
    expect(buf.getPixel(0, 3).a).toBe(0);
  });

  it("Blinds splits the buffer into repeated bands rather than one sweep", () => {
    const buf = filled(32, 4);
    applyTransitions(buf, EFFECT, 200, { inType: "Blinds", inDurationMs: 1000, inAdjust: 100 });
    // a single wipe would light one contiguous run; blinds light several separated runs
    let runs = 0;
    let inRun = false;
    for (let x = 0; x < 32; x++) {
      const lit = buf.getPixel(x, 0).a > 0;
      if (lit && !inRun) runs++;
      inRun = lit;
    }
    expect(runs).toBeGreaterThan(1);
  });

  it("Fade dims uniformly instead of masking by position", () => {
    const buf = filled(4, 4);
    applyTransitions(buf, EFFECT, 500, { inType: "Fade", inDurationMs: 1000 });
    const alphas = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) alphas.add(buf.getPixel(x, y).a);
    expect(alphas.size).toBe(1);
    expect([...alphas][0]).toBeCloseTo(128, -1);
  });

  it("the out transition masks toward the effect's end", () => {
    const buf = filled();
    applyTransitions(buf, EFFECT, 1000, { outType: "Circle Explode", outDurationMs: 200 });
    expect(litCount(buf)).toBe(0);

    const early = filled();
    applyTransitions(early, EFFECT, 500, { outType: "Circle Explode", outDurationMs: 200 });
    expect(litCount(early)).toBe(16 * 16); // out transition hasn't started yet
  });

  it("a spec with no type set is a plain fade (back-compat with the Fade-only version)", () => {
    const buf = filled(1, 1);
    applyTransitions(buf, EFFECT, 100, { inDurationMs: 200 });
    expect(buf.getPixel(0, 0).a).toBeCloseTo(128, -1);
  });

  it("transitionProgress reports 1 for a transition that isn't configured", () => {
    expect(transitionProgress(EFFECT, 500, {})).toEqual({ inProgress: 1, outProgress: 1 });
  });
});

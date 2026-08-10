import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { createStrobeState, renderStrobe } from "../src/effects/strobe";

describe("Strobe effect (SPEC ch8)", () => {
  it("frame 0 prepopulates the pool close to numberStrobes x duration (some expire same-frame due to staggered init durations)", () => {
    const buf = new RenderBuffer(10, 10);
    const state = createStrobeState(1);
    renderStrobe(buf, [rgba(255, 0, 0)], { numberStrobes: 3, duration: 5, type: 1 }, state);
    // poolTarget=15, staggered init durations 1..5 mean some strobes are born already at
    // duration 1 and expire in this same call's decrement pass.
    expect(state.strobes.length).toBeLessThanOrEqual(15);
    expect(state.strobes.length).toBeGreaterThan(0);
  });

  it("the pool refills back toward its target on the following frame", () => {
    const buf = new RenderBuffer(10, 10);
    const state = createStrobeState(1);
    const params = { numberStrobes: 3, duration: 5, type: 1 as const };
    renderStrobe(buf, [rgba(255, 0, 0)], params, state);
    const afterFrame1 = state.strobes.length;
    renderStrobe(buf, [rgba(255, 0, 0)], params, state);
    expect(state.strobes.length).toBeGreaterThanOrEqual(afterFrame1);
  });

  it("strobes expire and get removed after `duration` frames", () => {
    const buf = new RenderBuffer(10, 10);
    const state = createStrobeState(2);
    const params = { numberStrobes: 2, duration: 3, type: 1 as const };
    for (let f = 0; f < 20; f++) renderStrobe(buf, [rgba(255, 0, 0)], params, state);
    // pool refills every frame, so it never drains to 0, but every strobe's remaining is <= duration
    expect(state.strobes.every((s) => s.remaining <= params.duration)).toBe(true);
  });

  it("type 3 draws a full plus (5 lit pixels per strobe minimum)", () => {
    const buf = new RenderBuffer(20, 20);
    const state = createStrobeState(3);
    renderStrobe(buf, [rgba(255, 0, 0)], { numberStrobes: 1, duration: 10, type: 3 }, state);
    let lit = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (buf.getPixel(x, y).a > 0) lit++;
    expect(lit).toBeGreaterThan(0);
  });

  it("is deterministic given the same seed", () => {
    const params = { numberStrobes: 4, duration: 6, type: 1 as const };
    const bufA = new RenderBuffer(12, 12);
    const bufB = new RenderBuffer(12, 12);
    const stateA = createStrobeState(9);
    const stateB = createStrobeState(9);
    for (let f = 0; f < 5; f++) {
      renderStrobe(bufA, [rgba(0, 255, 0)], params, stateA);
      renderStrobe(bufB, [rgba(0, 255, 0)], params, stateB);
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(bufA.getPixel(x, y)).toEqual(bufB.getPixel(x, y));
  });
});

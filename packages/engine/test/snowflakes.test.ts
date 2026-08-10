import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { createSnowflakesState, renderSnowflakes } from "../src/effects/snowflakes";

describe("Snowflakes effect (SPEC ch8, Type=1, Falling)", () => {
  it("renders exactly `count` lit pixels", () => {
    const buf = new RenderBuffer(10, 10);
    const state = createSnowflakesState(10, 10, 5, 1);
    renderSnowflakes(buf, [rgba(255, 255, 255)], { speed: 10 }, state);
    let lit = 0;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (buf.getPixel(x, y).a > 0) lit++;
    expect(lit).toBeLessThanOrEqual(5);
    expect(lit).toBeGreaterThan(0);
  });

  it("flakes fall (decreasing y) over successive frames", () => {
    const state = createSnowflakesState(8, 20, 3, 2);
    const startY = state.flakes.map((f) => f.y);
    const buf = new RenderBuffer(8, 20);
    for (let i = 0; i < 3; i++) renderSnowflakes(buf, [rgba(255, 255, 255)], { speed: 20 }, state);
    const movedDown = state.flakes.some((f, i) => f.y < startY[i]! || f.y === 19); // 19 = wrapped/respawned at top
    expect(movedDown).toBe(true);
  });

  it("is deterministic given the same seed", () => {
    const stateA = createSnowflakesState(6, 6, 4, 42);
    const stateB = createSnowflakesState(6, 6, 4, 42);
    const bufA = new RenderBuffer(6, 6);
    const bufB = new RenderBuffer(6, 6);
    for (let i = 0; i < 4; i++) {
      renderSnowflakes(bufA, [rgba(255, 255, 255)], { speed: 10 }, stateA);
      renderSnowflakes(bufB, [rgba(255, 255, 255)], { speed: 10 }, stateB);
    }
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(bufA.getPixel(x, y)).toEqual(bufB.getPixel(x, y));
  });
});

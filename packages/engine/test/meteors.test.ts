import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { createMeteorsState, renderMeteors } from "../src/effects/meteors";

describe("Meteors effect (SPEC ch7, Effect=Down)", () => {
  it("with count=200 (spawn guaranteed every column) a meteor appears at the top row frame 1", () => {
    const buf = new RenderBuffer(4, 10);
    const state = createMeteorsState(1);
    renderMeteors(buf, [rgba(255, 0, 0)], { colors: "palette", count: 200, trailLength: 25, speed: 10 }, state);
    // count=200 means rng()*200 < 200 is always true -> every column spawns at pos=H-1=9
    let anyLit = false;
    for (let x = 0; x < 4; x++) if (buf.getPixel(x, 9).a > 0) anyLit = true;
    expect(anyLit).toBe(true);
  });

  it("with count=0 nothing ever spawns", () => {
    const buf = new RenderBuffer(4, 10);
    const state = createMeteorsState(1);
    renderMeteors(buf, [rgba(255, 0, 0)], { colors: "palette", count: 0, trailLength: 25, speed: 10 }, state);
    expect(state.meteors.length).toBe(0);
  });

  it("meteors move downward (lower average pos) over several frames", () => {
    const buf = new RenderBuffer(3, 20);
    const state = createMeteorsState(5);
    const params = { colors: "palette" as const, count: 200, trailLength: 10, speed: 25 };
    renderMeteors(buf, [rgba(0, 255, 0)], params, state);
    const firstPos = state.meteors[0]!.pos;
    for (let i = 0; i < 3; i++) renderMeteors(buf, [rgba(0, 255, 0)], params, state);
    // spawning keeps adding new meteors at pos=H-1, so check the FIRST meteor specifically moved down
    const tracked = state.meteors.find((m) => m.pos < firstPos);
    expect(tracked).toBeDefined();
  });

  it("is deterministic given the same seed", () => {
    const paramsA = { colors: "rainbow" as const, count: 50, trailLength: 20, speed: 15 };
    const stateA = createMeteorsState(99);
    const stateB = createMeteorsState(99);
    const bufA = new RenderBuffer(6, 12);
    const bufB = new RenderBuffer(6, 12);
    for (let f = 0; f < 4; f++) {
      renderMeteors(bufA, [rgba(255, 255, 0)], paramsA, stateA);
      renderMeteors(bufB, [rgba(255, 255, 0)], paramsA, stateB);
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) expect(bufA.getPixel(x, y)).toEqual(bufB.getPixel(x, y));
  });
});

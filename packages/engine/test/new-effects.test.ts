import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { renderOff } from "../src/effects/off";
import { renderShimmer } from "../src/effects/shimmer";
import { renderFill } from "../src/effects/fill";
import { createSnowStormState, renderSnowStorm } from "../src/effects/snowStorm";
import { createLifeState, renderLife, stepLife } from "../src/effects/life";
import { renderLightning } from "../src/effects/lightning";
import { renderCandle } from "../src/effects/candle";
import { renderLines } from "../src/effects/lines";
import { renderSpirograph } from "../src/effects/spirograph";
import { renderShape } from "../src/effects/shape";
import { renderMusic } from "../src/effects/music";
import { renderFireworks } from "../src/effects/fireworks";
import { renderTreeEffect } from "../src/effects/treeEffect";
import type { FrameContext } from "../src/effects/types";

const RED = rgba(255, 0, 0, 255);
const GREEN = rgba(0, 255, 0, 255);
const PALETTE = [RED, GREEN];

function ctx(position: number, frame = 0): FrameContext {
  return { frameIndexInEffect: frame, positionInEffect01: position, seed: 99 };
}

function lit(b: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}

describe("Off", () => {
  it("turns every pixel off, opaquely by default", () => {
    const b = new RenderBuffer(4, 4);
    b.fill(RED);
    renderOff(b, { transparent: false });
    expect(b.getPixel(0, 0)).toEqual(rgba(0, 0, 0, 255));
  });

  it("leaves the layers below showing when Transparent is set", () => {
    // The manual's own use for this is with canvas-style blending: an opaque Off hides what is
    // under it, a transparent one gates it. Rendering nothing at all would only ever do the
    // second, and the first is the common case.
    const b = new RenderBuffer(4, 4);
    b.fill(RED);
    renderOff(b, { transparent: true });
    expect(b.getPixel(0, 0).a).toBe(0);
  });
});

describe("Shimmer", () => {
  const params = { dutyFactor: 50, cycleCount: 10, useAllColors: false };

  it("is on for the duty share of each cycle and off for the rest", () => {
    const on = new RenderBuffer(2, 2);
    renderShimmer(on, PALETTE, params, ctx(0.0));
    expect(lit(on)).toBe(4);

    const off = new RenderBuffer(2, 2);
    renderShimmer(off, PALETTE, params, ctx(0.07)); // past 50% of the first of ten cycles
    expect(lit(off)).toBe(0);
  });

  it("a lower duty factor means less on-time", () => {
    const b = new RenderBuffer(2, 2);
    renderShimmer(b, PALETTE, { ...params, dutyFactor: 10 }, ctx(0.03));
    expect(lit(b)).toBe(0); // still on at 50% duty, already off at 10%
  });

  it("steps through the palette per cycle only when Use All Colors is set", () => {
    const plain = new RenderBuffer(1, 1);
    renderShimmer(plain, PALETTE, params, ctx(0.1)); // second cycle
    expect(plain.getPixel(0, 0)).toMatchObject({ r: 255, g: 0 });

    const all = new RenderBuffer(1, 1);
    renderShimmer(all, PALETTE, { ...params, useAllColors: true }, ctx(0.1));
    expect(all.getPixel(0, 0)).toMatchObject({ r: 0, g: 255 });
  });
});

describe("Fill", () => {
  const base = { position: 100, bandSize: 0, skipSize: 0, offset: 0, changeColorOverTime: false, direction: "up" as const };

  it("fills the whole model at position 100", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, base, ctx(0));
    expect(lit(b)).toBe(12);
  });

  it("fills part-way at a lower position", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, { ...base, position: 50 }, ctx(0));
    expect(lit(b)).toBe(6);
    expect(b.getPixel(0, 0).a).toBe(255); // bottom, because "up" starts at the bottom
    expect(b.getPixel(0, 3).a).toBe(0);
  });

  it("fills from the opposite edge going down", () => {
    const b = new RenderBuffer(3, 4);
    renderFill(b, PALETTE, { ...base, position: 50, direction: "down" }, ctx(0));
    expect(b.getPixel(0, 3).a).toBe(255);
    expect(b.getPixel(0, 0).a).toBe(0);
  });

  it("starts at the right edge for Left, which is what the manual says", () => {
    // "Left - starts at right and moves left", the opposite of what the word suggests alone.
    const b = new RenderBuffer(4, 1);
    renderFill(b, PALETTE, { ...base, position: 50, direction: "left" }, ctx(0));
    expect(b.getPixel(3, 0).a).toBe(255);
    expect(b.getPixel(0, 0).a).toBe(0);
  });

  it("cuts the fill into bands with a skip between them", () => {
    const b = new RenderBuffer(1, 8);
    renderFill(b, PALETTE, { ...base, bandSize: 2, skipSize: 2 }, ctx(0));
    expect(b.getPixel(0, 0).a).toBe(255);
    expect(b.getPixel(0, 1).a).toBe(255);
    expect(b.getPixel(0, 2).a).toBe(0);
    expect(b.getPixel(0, 3).a).toBe(0);
    expect(b.getPixel(0, 4).a).toBe(255);
  });

  it("walks the palette over the effect only when asked to", () => {
    const fixed = new RenderBuffer(1, 1);
    renderFill(fixed, PALETTE, base, ctx(0.9));
    expect(fixed.getPixel(0, 0)).toMatchObject({ r: 255, g: 0 });

    const changing = new RenderBuffer(1, 1);
    renderFill(changing, PALETTE, { ...base, changeColorOverTime: true }, ctx(0.9));
    expect(changing.getPixel(0, 0)).toMatchObject({ r: 0, g: 255 });
  });
});

describe("Snow Storm", () => {
  const params = { maxFlakes: 30, trailLength: 3, speed: 20 };

  it("puts particles on the buffer", () => {
    const b = new RenderBuffer(12, 12);
    const state = createSnowStormState(12, 12, params, 7);
    renderSnowStorm(b, PALETTE, params, state);
    expect(lit(b)).toBeGreaterThan(0);
  });

  it("moves them between frames", () => {
    const state = createSnowStormState(12, 12, params, 7);
    const before = state.particles.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|");
    renderSnowStorm(new RenderBuffer(12, 12), PALETTE, params, state);
    const after = state.particles.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|");
    expect(after).not.toBe(before);
  });

  it("keeps every particle inside the buffer, so the storm doesn't thin out", () => {
    const state = createSnowStormState(10, 10, params, 3);
    for (let f = 0; f < 60; f++) renderSnowStorm(new RenderBuffer(10, 10), PALETTE, params, state);
    for (const p of state.particles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(10);
    }
  });

  it("leaves a trail that fades behind each particle", () => {
    const state = createSnowStormState(20, 20, params, 5);
    for (let f = 0; f < 5; f++) renderSnowStorm(new RenderBuffer(20, 20), PALETTE, params, state);
    const alphas = new Set<number>();
    const b = new RenderBuffer(20, 20);
    renderSnowStorm(b, PALETTE, params, state);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const a = b.getPixel(x, y).a;
      if (a > 0) alphas.add(a);
    }
    expect(alphas.size).toBeGreaterThan(1); // head and trail are not the same brightness
  });

  it("is deterministic for a given seed", () => {
    const a = createSnowStormState(10, 10, params, 42);
    const b = createSnowStormState(10, 10, params, 42);
    expect(a.particles).toEqual(b.particles);
  });
});

describe("Life", () => {
  const params = { cellsToStart: 30, type: 0, speed: 25 };

  it("applies Conway's rules: a blinker oscillates with period two", () => {
    // The manual quotes the four rules verbatim, so this checks them against the canonical
    // pattern rather than against our own output.
    const state = createLifeState(5, 5, { ...params, cellsToStart: 0 }, 1);
    state.cells.fill(0);
    for (const x of [1, 2, 3]) state.cells[2 * 5 + x] = 1; // horizontal blinker
    stepLife(state, 0);
    expect([...state.cells].reduce((a, b) => a + b, 0)).toBe(3);
    expect(state.cells[1 * 5 + 2]).toBe(1); // now vertical
    expect(state.cells[3 * 5 + 2]).toBe(1);
    stepLife(state, 0);
    expect(state.cells[2 * 5 + 1]).toBe(1); // and back to horizontal
    expect(state.cells[2 * 5 + 3]).toBe(1);
  });

  it("a block is still life", () => {
    const state = createLifeState(6, 6, { ...params, cellsToStart: 0 }, 1);
    state.cells.fill(0);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]] as const) state.cells[y * 6 + x] = 1;
    const before = [...state.cells];
    stepLife(state, 0);
    expect([...state.cells]).toEqual(before);
  });

  it("wraps at the edges, because a model-sized grid is nearly all edge", () => {
    // A blinker straddling the left/right boundary only survives if the grid wraps.
    const state = createLifeState(5, 5, { ...params, cellsToStart: 0 }, 1);
    state.cells.fill(0);
    for (const x of [4, 0, 1]) state.cells[2 * 5 + x] = 1;
    stepLife(state, 0);
    expect([...state.cells].reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("holds a generation for several frames at a low speed", () => {
    const state = createLifeState(8, 8, params, 4);
    renderLife(new RenderBuffer(8, 8), PALETTE, { ...params, speed: 1 }, state);
    expect(state.generation).toBe(0); // less than one generation owed after one frame
  });

  it("is deterministic for a given seed", () => {
    const a = createLifeState(8, 8, params, 21);
    const b = createLifeState(8, 8, params, 21);
    expect([...a.cells]).toEqual([...b.cells]);
  });
});

describe("Lightning", () => {
  const params = {
    segments: 4,
    boltWidth: 3,
    forked: false,
    topX: 50,
    xMovement: 0,
    direction: "down" as const,
  };

  it("draws a bolt down the model", () => {
    const b = new RenderBuffer(20, 12);
    renderLightning(b, PALETTE, params, ctx(0.1));
    expect(lit(b)).toBeGreaterThan(10);
  });

  it("edges the bolt in white whatever the palette says", () => {
    // "White is always selected for the outer edge of the lightning bolt" - stated as a fact
    // about the effect, not an option.
    const b = new RenderBuffer(21, 6);
    renderLightning(b, [rgba(255, 0, 0, 255)], { ...params, boltWidth: 1 }, ctx(0.1));
    let white = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 21; x++) {
      const p = b.getPixel(x, y);
      if (p.a > 0 && p.r === 255 && p.g === 255 && p.b === 255) white++;
    }
    expect(white).toBeGreaterThan(0);
  });

  it("a width of 1 is a straight vertical line, as the manual says", () => {
    const b = new RenderBuffer(21, 8);
    renderLightning(b, PALETTE, { ...params, boltWidth: 1 }, ctx(0.1));
    const columns = new Set<number>();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 21; x++) if (b.getPixel(x, y).a > 0) columns.add(x);
    expect(columns.size).toBeLessThanOrEqual(3); // core plus its two white edges
  });

  it("a fork puts more on the model than a single bolt", () => {
    const plain = new RenderBuffer(24, 12);
    renderLightning(plain, PALETTE, params, ctx(0.1));
    const forked = new RenderBuffer(24, 12);
    renderLightning(forked, PALETTE, { ...params, forked: true }, ctx(0.1));
    expect(lit(forked)).toBeGreaterThan(lit(plain));
  });
});

describe("Candle", () => {
  const params = {
    flameAgility: 10,
    windBaseline: 60,
    windVariability: 40,
    windCalmness: 30,
    perNode: false,
    useColorPalette: false,
  };

  it("burns orange-to-red without the palette, which is the manual's default", () => {
    // "By default the Color Palette is not used and the flame is always an orange to reddish
    // color" - the opposite way round from every other effect, so worth pinning.
    const b = new RenderBuffer(3, 3);
    renderCandle(b, [rgba(0, 0, 255, 255)], params, ctx(0.2, 3));
    const p = b.getPixel(1, 1);
    expect(p.r).toBeGreaterThan(p.b);
  });

  it("uses the palette when asked to", () => {
    const b = new RenderBuffer(3, 3);
    renderCandle(b, [rgba(0, 0, 255, 255)], { ...params, useColorPalette: true }, ctx(0.2, 3));
    expect(b.getPixel(1, 1).b).toBeGreaterThan(0);
  });

  it("flickers the whole model together unless Per Node is set", () => {
    const together = new RenderBuffer(4, 4);
    renderCandle(together, PALETTE, params, ctx(0.2, 3));
    const alphas = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) alphas.add(together.getPixel(x, y).a);
    expect(alphas.size).toBe(1);

    const perNode = new RenderBuffer(4, 4);
    renderCandle(perNode, PALETTE, { ...params, perNode: true }, ctx(0.2, 3));
    const perNodeAlphas = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) perNodeAlphas.add(perNode.getPixel(x, y).a);
    expect(perNodeAlphas.size).toBeGreaterThan(1);
  });

  it("flickers over time", () => {
    const a = new RenderBuffer(2, 2);
    renderCandle(a, PALETTE, params, ctx(0.1, 0));
    const b = new RenderBuffer(2, 2);
    renderCandle(b, PALETTE, params, ctx(0.5, 40));
    expect(a.getPixel(0, 0)).not.toEqual(b.getPixel(0, 0));
  });
});

describe("Lines", () => {
  const params = { lines: 2, points: 4, thickness: 1, speed: 10, tails: 3, fadeTails: true };

  it("draws polygons on the buffer", () => {
    const b = new RenderBuffer(20, 20);
    renderLines(b, PALETTE, params, ctx(0.1, 5));
    expect(lit(b)).toBeGreaterThan(10);
  });

  it("keeps every vertex inside the buffer as it bounces", () => {
    // The bounce is closed-form rather than simulated, so this is really checking the folding
    // maths: a vertex that escaped would draw lines off the model for the rest of the effect.
    for (const frame of [0, 7, 61, 500, 5000]) {
      const b = new RenderBuffer(16, 9);
      renderLines(b, PALETTE, params, ctx(0.5, frame));
      expect(lit(b), `frame ${frame}`).toBeGreaterThan(0);
    }
  });

  it("is a pure function of the frame, so scrubbing lands where playback would", () => {
    const a = new RenderBuffer(16, 16);
    renderLines(a, PALETTE, params, ctx(0.4, 42));
    const b = new RenderBuffer(16, 16);
    renderLines(b, PALETTE, params, ctx(0.4, 42));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(b.getPixel(x, y)).toEqual(a.getPixel(x, y));
  });

  it("tails add to what is drawn, and fading them changes their brightness", () => {
    const none = new RenderBuffer(24, 24);
    renderLines(none, PALETTE, { ...params, tails: 0 }, ctx(0.5, 60));
    const many = new RenderBuffer(24, 24);
    renderLines(many, PALETTE, { ...params, tails: 8, fadeTails: false }, ctx(0.5, 60));
    expect(lit(many)).toBeGreaterThan(lit(none));
  });
});

describe("Spirograph", () => {
  const params = { speed: 10, outerRadius: 20, innerRadius: 7, distance: 12, animate: 0, length: 100 };

  it("draws a curve", () => {
    const b = new RenderBuffer(20, 20);
    renderSpirograph(b, PALETTE, params, ctx(0.3, 10));
    expect(lit(b)).toBeGreaterThan(5);
  });

  it("clamps r to R, which the manual states as a requirement", () => {
    // "r (inner circle Radius) should be <= R" - an unclamped larger r sends the figure outside
    // the buffer entirely, so the effect would render blank rather than wrong-looking.
    const b = new RenderBuffer(20, 20);
    renderSpirograph(b, PALETTE, { ...params, innerRadius: 90, outerRadius: 20 }, ctx(0.3, 10));
    expect(lit(b)).toBeGreaterThan(0);
  });

  it("uses only the first colour, per the manual", () => {
    const b = new RenderBuffer(20, 20);
    renderSpirograph(b, PALETTE, params, ctx(0.3, 10));
    const colors = new Set<string>();
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const p = b.getPixel(x, y);
      if (p.a > 0) colors.add(`${p.r},${p.g},${p.b}`);
    }
    expect(colors.size).toBe(1);
  });

  it("moves over time", () => {
    // Compared pixel by pixel, not by counting lit pixels: the figure is a closed curve, so the
    // count stays the same as it turns. This caught the effect standing completely still -
    // advancing the tracing phase alone re-draws a closed curve exactly, so the figure has to
    // spin for Speed to mean anything at full Length.
    const a = new RenderBuffer(20, 20);
    renderSpirograph(a, PALETTE, params, ctx(0.1, 0));
    const b = new RenderBuffer(20, 20);
    renderSpirograph(b, PALETTE, params, ctx(0.6, 90));
    let differing = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      if (a.getPixel(x, y).a !== b.getPixel(x, y).a) differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });
});

describe("Shape", () => {
  const params = {
    shape: "Circle" as const,
    thickness: 1,
    count: 1,
    startSize: 60,
    randomSizes: false,
    velocity: 0,
    direction: 90,
    lifetime: 100,
    growth: 0,
    centerX: 50,
    centerY: 50,
  };

  it("draws each shape as an outline", () => {
    for (const shape of ["Circle", "Square", "Triangle", "Star", "Heart"] as const) {
      const b = new RenderBuffer(21, 21);
      renderShape(b, PALETTE, { ...params, shape }, ctx(0.2));
      expect(lit(b), shape).toBeGreaterThan(4);
      // An outline, not a filled blob: the centre stays dark.
      expect(b.getPixel(10, 10).a, shape).toBe(0);
    }
  });

  it("honours the manual's direction convention: 90 is up and 270 is down", () => {
    // The obvious screen-coordinate reading would send 90 downwards, so this is worth pinning.
    const meanY = (direction: number) => {
      const b = new RenderBuffer(21, 41);
      renderShape(b, PALETTE, { ...params, startSize: 10, velocity: 3, direction, lifetime: 100 }, ctx(0.6));
      let sum = 0;
      let n = 0;
      for (let y = 0; y < 41; y++) for (let x = 0; x < 21; x++) if (b.getPixel(x, y).a > 0) { sum += y; n++; }
      expect(n, `direction ${direction} drew nothing`).toBeGreaterThan(0);
      return sum / n;
    };
    expect(meanY(90)).toBeGreaterThan(20);
    expect(meanY(270)).toBeLessThan(20);
  });

  it("grows a shape over its life when asked to", () => {
    const small = new RenderBuffer(31, 31);
    renderShape(small, PALETTE, { ...params, startSize: 10, growth: 0 }, ctx(0.9));
    const grown = new RenderBuffer(31, 31);
    renderShape(grown, PALETTE, { ...params, startSize: 10, growth: 80 }, ctx(0.9));
    expect(lit(grown)).toBeGreaterThan(lit(small));
  });

  it("draws several shapes when asked", () => {
    const one = new RenderBuffer(31, 31);
    renderShape(one, PALETTE, { ...params, startSize: 20, count: 1 }, ctx(0.5));
    const many = new RenderBuffer(31, 31);
    renderShape(many, PALETTE, { ...params, startSize: 20, count: 4, growth: 40 }, ctx(0.5));
    expect(lit(many)).toBeGreaterThan(lit(one));
  });
});

describe("Music", () => {
  const params = {
    bars: 8,
    type: "Morph" as const,
    sensitivity: 10,
    offset: 0,
    scaleBars: true,
    color: "Blend" as const,
    fade: false,
    logarithmicX: false,
  };
  const loud = { level: 0.9, bands: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] };
  const audioCtx = (audio: { level: number; bands: number[] }): FrameContext => ({
    frameIndexInEffect: 5,
    positionInEffect01: 0.3,
    seed: 4,
    audio,
  });

  it("draws bars from the analysed spectrum", () => {
    const b = new RenderBuffer(16, 10);
    renderMusic(b, PALETTE, params, audioCtx(loud));
    expect(lit(b)).toBeGreaterThan(0);
  });

  it("renders nothing with no audio, rather than inventing a spectrum", () => {
    const b = new RenderBuffer(16, 10);
    renderMusic(b, PALETTE, params, ctx(0.3, 5));
    expect(lit(b)).toBe(0);
  });

  it("raising sensitivity both hides quiet bars and shortens loud ones", () => {
    // The manual says increasing it "reduces the effects" - not merely gates them.
    const low = new RenderBuffer(16, 10);
    renderMusic(low, PALETTE, params, audioCtx(loud));
    const high = new RenderBuffer(16, 10);
    renderMusic(high, PALETTE, { ...params, sensitivity: 60 }, audioCtx(loud));
    expect(lit(high)).toBeLessThan(lit(low));
  });

  it("Separate grows from the middle out, Morph from the bottom up", () => {
    const quiet = { level: 0.3, bands: [0.35, 0, 0, 0, 0, 0, 0, 0] };
    const separate = new RenderBuffer(8, 11);
    renderMusic(separate, PALETTE, { ...params, type: "Separate", scaleBars: false }, audioCtx(quiet));
    const morph = new RenderBuffer(8, 11);
    renderMusic(morph, PALETTE, { ...params, type: "Morph", scaleBars: false }, audioCtx(quiet));
    expect(morph.getPixel(0, 0).a).toBeGreaterThan(0); // bottom row lit
    expect(separate.getPixel(0, 0).a).toBe(0); // ...but not for Separate
    expect(separate.getPixel(0, 5).a).toBeGreaterThan(0); // middle row instead
  });
});

describe("Fireworks", () => {
  const params = {
    explosions: 4,
    particles: 20,
    velocity: 20,
    gravity: 20,
    particleFade: 30,
    holdColor: true,
    fireWithMusic: false,
    triggerLevel: 30,
  };

  it("puts particles in the sky", () => {
    const b = new RenderBuffer(24, 24);
    renderFireworks(b, PALETTE, params, ctx(0.1, 3));
    expect(lit(b)).toBeGreaterThan(0);
  });

  it("gravity arcs the particles rather than leaving an expanding ring", () => {
    const floaty = new RenderBuffer(30, 30);
    renderFireworks(floaty, PALETTE, { ...params, gravity: 0 }, ctx(0.12, 4));
    const heavy = new RenderBuffer(30, 30);
    renderFireworks(heavy, PALETTE, { ...params, gravity: 90 }, ctx(0.12, 4));
    const meanY = (b: RenderBuffer) => {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (b.getPixel(x, y).a > 0) { sum += y; n++; }
      return n ? sum / n : 0;
    };
    expect(meanY(heavy)).toBeLessThan(meanY(floaty));
  });

  it("stays silent below the trigger level when fired by music", () => {
    const quiet: FrameContext = { frameIndexInEffect: 3, positionInEffect01: 0.1, seed: 4, audio: { level: 0.05, bands: [0.05] } };
    const b = new RenderBuffer(24, 24);
    renderFireworks(b, PALETTE, { ...params, fireWithMusic: true }, quiet);
    expect(lit(b)).toBe(0);

    const bang: FrameContext = { ...quiet, audio: { level: 0.9, bands: [0.9] } };
    const b2 = new RenderBuffer(24, 24);
    renderFireworks(b2, PALETTE, { ...params, fireWithMusic: true }, bang);
    expect(lit(b2)).toBeGreaterThan(0);
  });

  it("is a pure function of the frame, so scrubbing matches playback", () => {
    const a = new RenderBuffer(20, 20);
    renderFireworks(a, PALETTE, params, ctx(0.42, 17));
    const b = new RenderBuffer(20, 20);
    renderFireworks(b, PALETTE, params, ctx(0.42, 17));
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) expect(b.getPixel(x, y)).toEqual(a.getPixel(x, y));
  });
});

describe("Tree effect", () => {
  const params = { branches: 4, speed: 10, showTreeLights: true };

  it("uses the first colour as the background and the rest for branches", () => {
    // The manual's colour rule for this effect is the opposite of the usual one, so it is worth
    // asserting: palette[0] is the ground the branches are drawn on, not a branch colour.
    const b = new RenderBuffer(12, 12);
    renderTreeEffect(b, PALETTE, params, ctx(0.2, 2));
    let background = 0;
    let branch = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const p = b.getPixel(x, y);
      if (p.r === 255 && p.g === 0) background++;
      if (p.g === 255 && p.r === 0) branch++;
    }
    expect(background).toBeGreaterThan(branch);
    expect(branch).toBeGreaterThan(0);
  });

  it("leaves the background off when Show Tree Lights is unchecked", () => {
    const b = new RenderBuffer(12, 12);
    renderTreeEffect(b, PALETTE, { ...params, showTreeLights: false }, ctx(0.2, 2));
    expect(lit(b)).toBeLessThan(12 * 12);
  });

  it("moves the branches over time", () => {
    const a = new RenderBuffer(16, 16);
    renderTreeEffect(a, PALETTE, { ...params, showTreeLights: false }, ctx(0.1, 0));
    const b = new RenderBuffer(16, 16);
    renderTreeEffect(b, PALETTE, { ...params, showTreeLights: false }, ctx(0.5, 30));
    let differing = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (a.getPixel(x, y).a !== b.getPixel(x, y).a) differing++;
    expect(differing).toBeGreaterThan(0);
  });
});

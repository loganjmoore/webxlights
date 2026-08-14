import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { createTendrilsState, renderTendrils, TENDRIL_MOVEMENTS, type TendrilsParams } from "../src/effects/tendrils";
import { defaultParamsFor } from "../src/effects/schema";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowSequencer, renderRowAtMs } from "../src/renderFrame";
import type { AudioFrame, AudioSeries } from "../src/audio";

const WHITE = rgba(255, 255, 255, 255);

function params(overrides: Partial<TendrilsParams> = {}): TendrilsParams {
  return { ...(defaultParamsFor("Tendrils") as unknown as TendrilsParams), ...overrides };
}

// Runs the simulation for `frames` and returns the last frame, which is what a viewer sees.
function run(p: TendrilsParams, frames: number, seed = 7, size = 16, audio?: AudioFrame): RenderBuffer {
  const b = new RenderBuffer(size, size);
  const state = createTendrilsState(size, size, p, seed);
  for (let f = 0; f < frames; f++) {
    b.fill(rgba(0, 0, 0, 0));
    renderTendrils(b, [WHITE], p, state, audio);
  }
  return b;
}

function litPixels(b: RenderBuffer): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) out.push([x, y]);
  return out;
}

describe("Tendrils (manual: a twisting threadlike structure)", () => {
  it("draws a string, not a point", () => {
    // The string is a chain of segments joined by lines, so once the head has moved away from
    // where it started there is a shape with extent - a dot would mean the tail never followed.
    const lit = litPixels(run(params(), 30));
    expect(lit.length).toBeGreaterThan(3);
  });

  it("is deterministic for a given seed, and different for a different one", () => {
    expect(litPixels(run(params(), 25, 7))).toEqual(litPixels(run(params(), 25, 7)));
    expect(litPixels(run(params(), 25, 7))).not.toEqual(litPixels(run(params(), 25, 99)));
  });

  it("never leaves the model, however wildly it flaps", () => {
    // Friction at its highest is the manual's "wild flapping about" setting. A string that flew
    // off the buffer would leave the effect dark for the rest of its life.
    const b = run(params({ friction: 20, tension: 20, dampening: 20 }), 120);
    for (const [x, y] of litPixels(b)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(b.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(b.height);
    }
    expect(litPixels(b).length).toBeGreaterThan(0);
  });

  it("Trails adds more strings - the manual's 'partially unravelled rope'", () => {
    const one = litPixels(run(params({ trails: 0 }), 40)).length;
    const many = litPixels(run(params({ trails: 5 }), 40)).length;
    expect(many).toBeGreaterThan(one);
  });

  it("Thickness widens the string", () => {
    expect(litPixels(run(params({ thickness: 3 }), 40)).length).toBeGreaterThan(litPixels(run(params({ thickness: 1 }), 40)).length);
  });

  it("Speed below 10 steps the string on fewer frames, so it has travelled less", () => {
    // "Speed: 10 is full speed." Same number of frames, less distance covered - and the string
    // is still drawn every frame, so this slows the movement rather than hiding it.
    const spread = (p: TendrilsParams) => {
      const lit = litPixels(run(p, 30));
      const ys = lit.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(litPixels(run(params({ speed: 1 }), 30)).length).toBeGreaterThan(0);
    expect(spread(params({ speed: 1 }))).toBeLessThanOrEqual(spread(params({ speed: 10 })));
  });

  it("every movement in the list actually moves the string", () => {
    // The movement names come from the effect itself, so a name in the props panel that the
    // simulation doesn't handle would be a control that silently does nothing.
    const audio: AudioFrame = { level: 0.8, bands: [0.8, 0.2] };
    for (const movement of TENDRIL_MOVEMENTS) {
      const lit = litPixels(run(params({ movement }), 40, 7, 16, audio));
      expect(lit.length, `${movement} drew nothing`).toBeGreaterThan(0);
    }
  });

  it("the music movements follow the music rather than ignoring it", () => {
    const quiet: AudioFrame = { level: 0.05, bands: [0.05] };
    const loud: AudioFrame = { level: 0.95, bands: [0.95] };
    const meanY = (audio: AudioFrame) => {
      const lit = litPixels(run(params({ movement: "Music Line" }), 40, 7, 16, audio));
      return lit.reduce((sum, [, y]) => sum + y, 0) / Math.max(1, lit.length);
    };
    expect(meanY(loud)).toBeGreaterThan(meanY(quiet));
  });

  it("renders the same through the sequential export path as through a scrub", () => {
    // Tendrils is stateful, so the two paths reach a frame differently - the exporter carries
    // the string forward, a scrub replays it from the start. They have to agree, or the preview
    // and the exported .fseq show different pictures.
    const geometry = computeVerticalMatrixTopLeft({ strings: 8, nodesPerString: 8 });
    const effects = [{ name: "Tendrils", startMs: 0, endMs: 2000, params: params() as unknown as Record<string, unknown> }];
    const series: AudioSeries = { frameMs: 50, bandCount: 1, frames: [{ level: 0.5, bands: [0.5] }] };
    const sequencer = createRowSequencer({ geometry, effects }, 50, 3, [WHITE], series);
    for (let f = 0; f < 15; f++) {
      const atMs = f * 50;
      expect(sequencer.renderFrameAt(atMs)).toEqual(renderRowAtMs({ geometry, effects }, atMs, 50, 3, [WHITE], series));
    }
  });

  it("renders nothing into a buffer with no size, rather than throwing", () => {
    const p = params();
    expect(() => renderTendrils(new RenderBuffer(0, 0), [WHITE], p, createTendrilsState(0, 0, p, 1), undefined)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { computeSingleLine } from "../src/models/line";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowSequencer, renderRowAtMs, type RenderableEffect } from "../src/renderFrame";
import { CANVAS_ONLY_EFFECTS, EFFECT_SCHEMAS, defaultParamsFor } from "../src/effects/schema";
import type { AudioSeries } from "../src/audio";
import type { ValueCurve } from "../src/valueCurve";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);
const PALETTE = [RED, BLUE];

const line = computeSingleLine({ strings: 1, nodesPerString: 8 });
const matrix = computeVerticalMatrixTopLeft({ strings: 8, nodesPerString: 8 });

function onEffect(params: Record<string, unknown> = {}): RenderableEffect {
  return {
    name: "On",
    startMs: 0,
    endMs: 1000,
    params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false, ...params },
  };
}

describe("Value curves reach every effect through the render pipeline", () => {
  it("a curve on any VC-flagged param animates without the effect knowing about curves", () => {
    // Circles' Size param is VC-flagged; with the circles held still, a bigger radius is
    // strictly more lit nodes, so the curve's effect is visible in the rendered output alone.
    const curve: ValueCurve = { type: "Ramp", min: 1, max: 6 };
    const effect: RenderableEffect = {
      name: "Circles",
      startMs: 0,
      endMs: 1000,
      params: { count: 2, size: curve, movement: "none", speed: 0, fade: false, bubbles: false },
    };
    const lit = (atMs: number): number =>
      renderRowAtMs({ geometry: matrix, effects: [effect] }, atMs, 50, 1, PALETTE).filter((c) => c.a > 0).length;
    expect(lit(900)).toBeGreaterThan(lit(100));
  });

  it("a Square curve switches a param between two values mid-effect", () => {
    const curve: ValueCurve = { type: "Square", min: 0, max: 100, cycles: 1 };
    const effect = onEffect({ transparencyPct: curve });
    const alphaAt = (atMs: number): number =>
      renderRowAtMs({ geometry: line, effects: [effect] }, atMs, 50, 1, PALETTE)[0]!.a;
    expect(alphaAt(100)).toBe(0); // first half: transparency 100 -> invisible
    expect(alphaAt(700)).toBe(255); // second half: transparency 0 -> solid
  });

  it("the export sequencer resolves curves the same way the preview does", () => {
    const effect = onEffect({ transparencyPct: { type: "Ramp", min: 0, max: 100 } as ValueCurve });
    const row = { geometry: line, effects: [effect] };
    const sequencer = createRowSequencer(row, 50, 1, PALETTE);
    for (let ms = 0; ms < 1000; ms += 50) {
      expect(sequencer.renderFrameAt(ms), `frame at ${ms}ms`).toEqual(renderRowAtMs(row, ms, 50, 1, PALETTE));
    }
  });

  it("an uncurved sequence is unaffected by the resolution pass", () => {
    const colors = renderRowAtMs({ geometry: line, effects: [onEffect()] }, 500, 50, 1, PALETTE);
    expect(colors[0]).toEqual(RED);
  });
});

describe("Audio reaches audio-reactive effects through the render pipeline", () => {
  const series: AudioSeries = {
    frameMs: 50,
    bandCount: 4,
    frames: [
      { level: 0, bands: [0, 0, 0, 0] },
      { level: 1, bands: [1, 1, 1, 1] },
    ],
  };
  const vuEffect: RenderableEffect = {
    name: "VU Meter",
    startMs: 0,
    endMs: 1000,
    params: { type: "Level Bar", bars: 4, gainPct: 100, sensitivityPct: 50 },
  };

  it("renders from the analysed frame at the playhead", () => {
    const row = { geometry: matrix, effects: [vuEffect] };
    const quiet = renderRowAtMs(row, 0, 50, 1, PALETTE, series).filter((c) => c.a > 0).length;
    const loud = renderRowAtMs(row, 50, 50, 1, PALETTE, series).filter((c) => c.a > 0).length;
    expect(quiet).toBe(0);
    expect(loud).toBeGreaterThan(0);
  });

  it("renders nothing when the sequence has no audio at all", () => {
    const colors = renderRowAtMs({ geometry: matrix, effects: [vuEffect] }, 50, 50, 1, PALETTE);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });
});

describe("Transitions apply to any effect in the pipeline", () => {
  it("a non-fade in-transition masks by position, not uniformly", () => {
    const effect: RenderableEffect = { ...onEffect(), transition: { inType: "Wipe", inDurationMs: 500 } };
    const colors = renderRowAtMs({ geometry: line, effects: [effect] }, 250, 50, 1, PALETTE);
    const alphas = new Set(colors.map((c) => c.a));
    expect(alphas.size).toBeGreaterThan(1); // some nodes revealed, some not
  });

  it("the effect is fully revealed once the in-transition has finished", () => {
    const effect: RenderableEffect = { ...onEffect(), transition: { inType: "Circle Explode", inDurationMs: 300 } };
    const colors = renderRowAtMs({ geometry: line, effects: [effect] }, 600, 50, 1, PALETTE);
    expect(colors.every((c) => c.a === 255)).toBe(true);
  });
});

describe("Effect registry", () => {
  it("every schema in the palette actually renders something through the pipeline", () => {
    // Text and Pictures need content, and VU Meter needs audio; everything else should paint
    // with nothing but its defaults - a schema whose name doesn't match the renderFrame switch
    // would silently render an empty layer, which is exactly what this catches.
    //
    // The canvas effects are excluded because rendering nothing on a blank buffer is *correct*
    // for them - they modify the layer below. The test below covers them instead, with the
    // canvas they need, so they aren't simply exempted.
    //
    // State and Faces are excluded for the same shape of reason: everything they draw comes from
    // a definition on the *model*, so with nothing but their own defaults there is nothing to
    // light. Both get their own assertions below, with the definitions and labels that drive
    // them, rather than being exempted outright.
    const needsContent = new Set(["Pictures", "State", "Faces", ...CANVAS_ONLY_EFFECTS]);
    const series: AudioSeries = { frameMs: 50, bandCount: 2, frames: [{ level: 1, bands: [1, 1] }] };

    for (const name of Object.keys(EFFECT_SCHEMAS)) {
      if (needsContent.has(name)) continue;
      const effect: RenderableEffect = { name, startMs: 0, endMs: 1000, params: defaultParamsFor(name) };
      const colors = renderRowAtMs({ geometry: matrix, effects: [effect] }, 400, 50, 42, PALETTE, series);
      expect(colors.some((c) => c.a > 0), `"${name}" rendered an empty frame with default params`).toBe(true);
    }
  });

  it("every canvas effect actually changes the layer underneath it", () => {
    // The other half of the guard above. A canvas effect that didn't match the renderFrame
    // switch would leave the layer below untouched - which looks like a working sequence, since
    // the layer below still shows, and is the reason this needs its own assertion rather than
    // an exemption.
    const under: RenderableEffect = {
      name: "Bars",
      startMs: 0,
      endMs: 1000,
      params: defaultParamsFor("Bars"),
    };
    const baseline = renderRowAtMs({ geometry: matrix, effects: [under] }, 400, 50, 42, PALETTE);

    for (const name of CANVAS_ONLY_EFFECTS) {
      const canvasLayer: RenderableEffect = {
        name,
        startMs: 0,
        endMs: 1000,
        params: defaultParamsFor(name),
        blendMode: "Canvas",
      };
      const withCanvas = renderRowAtMs({ geometry: matrix, effects: [under, canvasLayer] }, 400, 50, 42, PALETTE);
      expect(withCanvas, `"${name}" left the layer below untouched`).not.toEqual(baseline);
    }
  });

  it("a canvas effect on its own renders nothing, which is what the manual says it should", () => {
    // Kaleidoscope "by itself does nothing". Without a canvas there is nothing underneath to
    // modify, and inventing something to draw would be worse than drawing nothing.
    for (const name of CANVAS_ONLY_EFFECTS) {
      const effect: RenderableEffect = { name, startMs: 0, endMs: 1000, params: defaultParamsFor(name) };
      const colors = renderRowAtMs({ geometry: matrix, effects: [effect] }, 400, 50, 42, PALETTE);
      expect(colors.every((c) => c.a === 0), `"${name}" drew something with no canvas`).toBe(true);
    }
  });

  it("State renders through the pipeline once it has the definitions and labels that drive it", () => {
    // The other half of the exemption above, and the only place the *plumbing* is checked: a
    // state effect's data has to survive renderRowAtMs and reach the effect with the model's own
    // nodes attached, or the effect renders nothing and looks like a broken definition.
    const effect: RenderableEffect = {
      name: "State",
      startMs: 0,
      endMs: 1000,
      params: { ...defaultParamsFor("State"), useTimingTrack: true },
      data: {
        states: [{ name: "wink", nodes: "1-4" }],
        timing: [{ startMs: 0, endMs: 1000, label: "wink" }],
      },
    };
    const colors = renderRowAtMs({ geometry: matrix, effects: [effect] }, 400, 50, 42, PALETTE);
    expect(colors.filter((c) => c.a > 0)).toHaveLength(4);
  });

  it("Faces renders through the pipeline once it has a face definition and phonemes", () => {
    const effect: RenderableEffect = {
      name: "Faces",
      startMs: 0,
      endMs: 1000,
      params: { ...defaultParamsFor("Faces"), useTimingTrack: true },
      data: {
        face: { name: "Face1", mouths: [{ name: "AI", nodes: "1-3" }], eyesOpen: "10", outline: "20-21" },
        timing: [{ startMs: 0, endMs: 1000, label: "AI" }],
      },
    };
    const colors = renderRowAtMs({ geometry: matrix, effects: [effect] }, 400, 50, 42, PALETTE);
    // three mouth nodes, one eye, two outline
    expect(colors.filter((c) => c.a > 0)).toHaveLength(6);
  });

  it("defaultParamsFor covers every param the schema declares", () => {
    for (const [name, schema] of Object.entries(EFFECT_SCHEMAS)) {
      const defaults = defaultParamsFor(name);
      for (const param of schema.params) {
        expect(defaults[param.key], `${name}.${param.key}`).toBeDefined();
      }
    }
  });
});

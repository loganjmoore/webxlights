import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { computeSingleLine } from "../src/models/line";
import { createRowSequencer, renderRowAtMs } from "../src/renderFrame";
import { defaultParamsFor, EFFECT_SCHEMAS } from "../src/effects/schema";

const RED = rgba(255, 0, 0, 255);

describe("renderRowAtMs (M4 frame-render pipeline)", () => {
  const geometry = computeSingleLine({ strings: 1, nodesPerString: 5 });

  it("returns transparent nodes when no effect is active at atMs", () => {
    const colors = renderRowAtMs({ geometry, effects: [] }, 500, 50, 1, [RED]);
    expect(colors).toHaveLength(5);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });

  it("renders an On effect active at atMs", () => {
    const effects = [{ name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } }];
    const colors = renderRowAtMs({ geometry, effects }, 500, 50, 1, [RED]);
    expect(colors[0]).toEqual(RED);
  });

  it("an effect outside its time range does not render", () => {
    const effects = [{ name: "On", startMs: 0, endMs: 500, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } }];
    const colors = renderRowAtMs({ geometry, effects }, 600, 50, 1, [RED]);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });

  it("a stateful effect (Fire) renders something non-transparent", () => {
    const effects = [{ name: "Fire", startMs: 0, endMs: 2000, params: { height: 50, hueShift: 0, growthCycles: 0 } }];
    const geo = computeSingleLine({ strings: 1, nodesPerString: 20 });
    const colors = renderRowAtMs({ geometry: geo, effects }, 800, 50, 3, [RED]);
    expect(colors.some((c) => c.a > 0)).toBe(true);
  });

  it("is deterministic: same atMs + seed produce the same node colors", () => {
    const effects = [{ name: "Bars", startMs: 0, endMs: 1000, params: { paletteRep: 1, cycles: 1, direction: "down", centerPercent: 0, highlight: false } }];
    const a = renderRowAtMs({ geometry, effects }, 333, 50, 7, [RED]);
    const b = renderRowAtMs({ geometry, effects }, 333, 50, 7, [RED]);
    expect(a).toEqual(b);
  });

  it("two overlapping effects on the same row layer bottom-to-top (array order)", () => {
    const effects = [
      { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } },
      { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } },
    ];
    const colors = renderRowAtMs({ geometry, effects }, 500, 50, 1, [RED, rgba(0, 0, 255)]);
    // second "On" layer also uses palette[0]=RED (same params) -> Normal blend of red-over-red = red
    expect(colors[0]).toEqual(RED);
  });

  // Regression: importing a real .xsq effect with no PARAM_MAPPER entry (10 of the 15
  // render-implemented effects, e.g. Shockwave/SingleStrand/Pinwheel) must fall back to
  // defaultParamsFor(name), which every renderer here has to treat as safe input - a real real
  // show export crashed with "Cannot read properties of undefined (reading 'r')" the first time
  // this wasn't true (Shockwave's color-blend math on an empty {} params object). The fix lives
  // in apps/web (defaultParamsFor is what a missing-mapper effect now gets instead of {}); this
  // locks in the contract the fix depends on at the layer with test coverage.
  it("every schema-registered effect renders without throwing on its own schema defaults", () => {
    const geo = computeSingleLine({ strings: 2, nodesPerString: 20 });
    for (const name of Object.keys(EFFECT_SCHEMAS)) {
      const effects = [{ name, startMs: 0, endMs: 2000, params: defaultParamsFor(name) }];
      expect(
        () => renderRowAtMs({ geometry: geo, effects }, 500, 50, 1, [RED, rgba(0, 0, 255)]),
        `${name} threw on its own schema defaults`,
      ).not.toThrow();
    }
  });

  // M15.3: a per-effect Color override (real xLights' Color tab) wins over the row's own
  // palette when set, and the row palette still applies when an effect has none.
  it("an effect's own palette overrides the row's default palette", () => {
    const BLUE = rgba(0, 0, 255, 255);
    const params = { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false };
    const withOverride = renderRowAtMs(
      { geometry, effects: [{ name: "On", startMs: 0, endMs: 1000, params, palette: [BLUE] }] },
      500,
      50,
      1,
      [RED],
    );
    expect(withOverride[0]).toEqual(BLUE);

    const withoutOverride = renderRowAtMs({ geometry, effects: [{ name: "On", startMs: 0, endMs: 1000, params }] }, 500, 50, 1, [RED]);
    expect(withoutOverride[0]).toEqual(RED);
  });

  // M15.4: real xLights' Layer Blending panel (blend mode + Mix) was fully implemented in
  // blend.ts/layerStack.ts but every call site hardcoded "Normal"/0 - no per-effect override
  // ever reached the layer stack. Two opaque "On" layers under default Normal blend always
  // show only the top layer's color; Additive proves the override wires through.
  it("an effect's own blendMode reaches the layer stack", () => {
    const BLUE = rgba(0, 0, 255, 255);
    const onParams = { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false };
    const effects = [
      { name: "On", startMs: 0, endMs: 1000, params: onParams, palette: [RED] },
      { name: "On", startMs: 0, endMs: 1000, params: onParams, palette: [BLUE], blendMode: "Additive" as const },
    ];
    const normalTop = renderRowAtMs(
      { geometry, effects: [effects[0]!, { ...effects[1]!, blendMode: undefined }] },
      500,
      50,
      1,
      [RED],
    );
    expect(normalTop[0]).toEqual(BLUE); // Normal: opaque top layer fully overwrites

    const additive = renderRowAtMs({ geometry, effects }, 500, 50, 1, [RED]);
    expect(additive[0]).toEqual(rgba(255, 0, 255, 255)); // Additive: red + blue = magenta
  });
});

// Persistent (manual: Sequencer > Layers > Layer Settings): "does not clear the display buffer
// before rendering each frame. The result is the preview frame remains until overwritten by a
// subsequent frame." A chase is the clearest witness - normally two lit nodes travelling along
// the strand, but with the buffer kept it paints the strand in behind itself.
describe("Persistent layer setting", () => {
  const geometry = computeSingleLine({ strings: 1, nodesPerString: 20 });
  const chase = { chaseSizePct: 10, cycles: 1, offsetPct: 0 };
  const lit = (colors: ReturnType<typeof renderRowAtMs>) => colors.filter((c) => c.a > 0).length;

  it("keeps what earlier frames drew, where a normal layer would have cleared it", () => {
    const plain = { name: "SingleStrand", startMs: 0, endMs: 1000, params: chase };
    const persistent = { ...plain, layer: { persistent: true } };

    const atStart = lit(renderRowAtMs({ geometry, effects: [persistent] }, 0, 50, 1, [RED]));
    const later = lit(renderRowAtMs({ geometry, effects: [persistent] }, 600, 50, 1, [RED]));
    expect(later).toBeGreaterThan(atStart);
    expect(later).toBeGreaterThan(lit(renderRowAtMs({ geometry, effects: [plain] }, 600, 50, 1, [RED])));
  });

  it("changes nothing for a layer that hasn't asked for it", () => {
    const effects = [{ name: "SingleStrand", startMs: 0, endMs: 1000, params: chase }];
    const off = renderRowAtMs({ geometry, effects: [{ ...effects[0]!, layer: { persistent: false } }] }, 600, 50, 1, [RED]);
    expect(off).toEqual(renderRowAtMs({ geometry, effects }, 600, 50, 1, [RED]));
  });

  it("renders the same through the sequential export path as through a scrub", () => {
    // The two paths reach persistence differently - the exporter keeps one buffer across the
    // frames it is already walking, a scrub replays them - so they have to be checked against
    // each other or the exported .fseq can differ from what the preview showed.
    const effects = [{ name: "SingleStrand", startMs: 0, endMs: 1000, params: chase, layer: { persistent: true } }];
    const sequencer = createRowSequencer({ geometry, effects }, 50, 1, [RED]);
    for (let f = 0; f < 20; f++) {
      const atMs = f * 50;
      expect(sequencer.renderFrameAt(atMs)).toEqual(renderRowAtMs({ geometry, effects }, atMs, 50, 1, [RED]));
    }
  });
});

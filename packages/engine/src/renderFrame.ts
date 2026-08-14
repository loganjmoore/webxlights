import type { RGBA } from "./color";
import { rgba } from "./color";
import { RenderBuffer } from "./renderBuffer";
import type { ModelGeometry } from "./models/types";
import { renderLayerStackToNodes, type NodeLayerSpec } from "./layerStack";

import type { BlendMode } from "./blend";
import { audioFrameAt, type AudioSeries } from "./audio";
import { renderWithLayerSettings, type LayerSettings } from "./layerSettings";
import { applyRenderStyle } from "./renderStyle";
import { renderOn, type OnParams } from "./effects/on";
import { renderBars, type BarsParams } from "./effects/bars";
import { renderColorWash, type ColorWashParams } from "./effects/colorWash";
import { renderButterfly, type ButterflyParams } from "./effects/butterfly";
import { renderSpirals, type SpiralsParams } from "./effects/spirals";
import { renderTwinkle, type TwinkleParams } from "./effects/twinkle";
import { renderSingleStrandChase, type SingleStrandChaseParams } from "./effects/singleStrand";
import { createFireState, renderFire, type FireParams } from "./effects/fire";
import { createMeteorsState, renderMeteors, type MeteorsParams } from "./effects/meteors";
import { createSnowflakesState, renderSnowflakes, type SnowflakesParams } from "./effects/snowflakes";
import { renderStrobe, createStrobeState, type StrobeParams } from "./effects/strobe";
import { renderRipple, type RippleParams } from "./effects/ripple";
import { renderWave, type WaveParams } from "./effects/wave";
import { renderPinwheel, type PinwheelParams } from "./effects/pinwheel";
import { renderShockwave, type ShockwaveParams } from "./effects/shockwave";
import { renderGarlands, type GarlandsParams } from "./effects/garlands";
import { renderCurtain, type CurtainParams } from "./effects/curtain";
import { renderPlasma, type PlasmaParams } from "./effects/plasma";
import { renderGalaxy, type GalaxyParams } from "./effects/galaxy";
import { renderFan, type FanParams } from "./effects/fan";
import { renderMarquee, type MarqueeParams } from "./effects/marquee";
import { renderCircles, type CirclesParams } from "./effects/circles";
import { renderText, type TextParams } from "./effects/text";
import { renderPictures, type PicturesParams } from "./effects/pictures";
import { renderVuMeter, type VuMeterParams } from "./effects/vuMeter";
import { renderOff, type OffParams } from "./effects/off";
import { renderShimmer, type ShimmerParams } from "./effects/shimmer";
import { renderFill, type FillParams } from "./effects/fill";
import { createSnowStormState, renderSnowStorm, type SnowStormParams, type SnowStormState } from "./effects/snowStorm";
import { createLifeState, renderLife, type LifeParams, type LifeState } from "./effects/life";
import { renderLightning, type LightningParams } from "./effects/lightning";
import { renderCandle, type CandleParams } from "./effects/candle";
import { renderLines, type LinesParams } from "./effects/lines";
import { renderSpirograph, type SpirographParams } from "./effects/spirograph";
import { renderShape, type ShapeParams } from "./effects/shape";
import { renderMusic, type MusicParams } from "./effects/music";
import { renderFireworks, type FireworksParams } from "./effects/fireworks";
import { renderTreeEffect, type TreeEffectParams } from "./effects/treeEffect";
import type { FrameContext } from "./effects/types";
import { resolveParamsAtPosition } from "./valueCurve";
import { applyTransitions, type TransitionSpec } from "./transition";

export interface RenderableEffect {
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, unknown>;
  transition?: TransitionSpec;
  // Per-effect color override (real xLights' Color tab) - falls back to the row's own palette
  // (the app-wide default, until a model/group-level palette exists) when unset.
  palette?: RGBA[];
  // Real xLights' Layer Blending panel: how this effect's layer composites onto the layers
  // below it (default "Normal" = fully opaque overwrite) and the "Mix" slider some blend
  // modes read as their reveal/fade threshold (see blend.ts's blendPixel).
  blendMode?: BlendMode;
  mix?: number; // 0..1
  // Real xLights' Layer Settings panel: transformation, blur and sub-buffer. These sit between
  // the effect and the model, so they apply to every effect without any effect knowing
  // (layerSettings.ts).
  layer?: LayerSettings;
}

export interface RenderableRow {
  geometry: ModelGeometry;
  effects: RenderableEffect[];
}

const MAX_LAYERS = 5;

// Effects with per-frame state (heat map / particle list) that must be simulated forward
// frame-by-frame from the effect's start to reach `atMs` - correct for a scrubbing preview
// (not a real-time constraint), cheap at typical effect lengths (a few hundred frames).
const STATEFUL_EFFECTS = new Set(["Fire", "Meteors", "Snowflakes", "Strobe", "Snow Storm", "Life"]);

function positionOf(effect: RenderableEffect, atMs: number): number {
  const duration = effect.endMs - effect.startMs || 1;
  return Math.max(0, Math.min(1, (atMs - effect.startMs) / duration));
}

// Every effect sees plain numbers: any param holding a ValueCurve is collapsed here, once per
// effect per frame, so a curve works on every VC-flagged param without the effect knowing.
function paramsAt(effect: RenderableEffect, position01: number): Record<string, unknown> {
  return resolveParamsAtPosition(effect.params, position01);
}

function renderStateless(
  buffer: RenderBuffer,
  rowPalette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  seed: number,
  audio: AudioSeries | undefined,
): void {
  const palette = effect.palette ?? rowPalette; // real xLights' per-effect Color tab
  const positionInEffect01 = positionOf(effect, atMs);
  const frameIndexInEffect = 0; // shimmer/parity-only field; scrubbing doesn't track frame parity
  // Left undefined when the sequence has no analysed track, so audio-reactive effects can tell
  // "no audio loaded" apart from "this frame of the song is silent".
  const ctx: FrameContext = {
    frameIndexInEffect,
    positionInEffect01,
    seed,
    audio: audio ? audioFrameAt(audio, atMs) : undefined,
  };
  const params = paramsAt(effect, positionInEffect01);

  switch (effect.name) {
    case "Off":
      renderOff(buffer, params as unknown as OffParams);
      break;
    case "Music":
      renderMusic(buffer, palette, params as unknown as MusicParams, ctx);
      break;
    case "Fireworks":
      renderFireworks(buffer, palette, params as unknown as FireworksParams, ctx);
      break;
    case "Tree":
      renderTreeEffect(buffer, palette, params as unknown as TreeEffectParams, ctx);
      break;
    case "Lines":
      renderLines(buffer, palette, params as unknown as LinesParams, ctx);
      break;
    case "Spirograph":
      renderSpirograph(buffer, palette, params as unknown as SpirographParams, ctx);
      break;
    case "Shape":
      renderShape(buffer, palette, params as unknown as ShapeParams, ctx);
      break;
    case "Lightning":
      renderLightning(buffer, palette, params as unknown as LightningParams, ctx);
      break;
    case "Candle":
      renderCandle(buffer, palette, params as unknown as CandleParams, ctx);
      break;
    case "Shimmer":
      renderShimmer(buffer, palette, params as unknown as ShimmerParams, ctx);
      break;
    case "Fill":
      renderFill(buffer, palette, params as unknown as FillParams, ctx);
      break;
    case "On":
      renderOn(buffer, palette, params as unknown as OnParams, ctx);
      break;
    case "Bars":
      renderBars(buffer, palette, params as unknown as BarsParams, ctx);
      break;
    case "Color Wash":
      renderColorWash(buffer, palette, params as unknown as ColorWashParams, ctx);
      break;
    case "Butterfly":
      renderButterfly(buffer, palette, params as unknown as ButterflyParams, ctx);
      break;
    case "Spirals":
      renderSpirals(buffer, palette, params as unknown as SpiralsParams, ctx);
      break;
    case "Twinkle":
      renderTwinkle(buffer, palette, params as unknown as TwinkleParams, ctx);
      break;
    case "SingleStrand":
      renderSingleStrandChase(buffer, palette, params as unknown as SingleStrandChaseParams, ctx);
      break;
    case "Ripple":
      renderRipple(buffer, palette, params as unknown as RippleParams, ctx);
      break;
    case "Wave":
      renderWave(buffer, palette, params as unknown as WaveParams, ctx);
      break;
    case "Pinwheel":
      renderPinwheel(buffer, palette, params as unknown as PinwheelParams, ctx);
      break;
    case "Shockwave":
      renderShockwave(buffer, palette, params as unknown as ShockwaveParams, ctx);
      break;
    case "Garlands":
      renderGarlands(buffer, palette, params as unknown as GarlandsParams, ctx);
      break;
    case "Curtain":
      renderCurtain(buffer, palette, params as unknown as CurtainParams, ctx);
      break;
    case "Plasma":
      renderPlasma(buffer, palette, params as unknown as PlasmaParams, ctx);
      break;
    case "Galaxy":
      renderGalaxy(buffer, palette, params as unknown as GalaxyParams, ctx);
      break;
    case "Fan":
      renderFan(buffer, palette, params as unknown as FanParams, ctx);
      break;
    case "Marquee":
      renderMarquee(buffer, palette, params as unknown as MarqueeParams, ctx);
      break;
    case "Circles":
      renderCircles(buffer, palette, params as unknown as CirclesParams, ctx);
      break;
    case "Text":
      renderText(buffer, palette, params as unknown as TextParams, ctx);
      break;
    case "Pictures":
      renderPictures(buffer, palette, params as unknown as PicturesParams, ctx);
      break;
    case "VU Meter":
      renderVuMeter(buffer, palette, params as unknown as VuMeterParams, ctx);
      break;
    default:
      break; // unknown effect name: leave the layer transparent rather than throw
  }
}

function renderStateful(
  buffer: RenderBuffer,
  rowPalette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  frameMs: number,
  seed: number,
): void {
  const palette = effect.palette ?? rowPalette; // real xLights' per-effect Color tab
  const duration = effect.endMs - effect.startMs || 1;
  const framesElapsed = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));

  if (effect.name === "Fire") {
    const state = createFireState(buffer.width, buffer.height, seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const position01 = Math.min(1, (f * frameMs) / duration);
      const params = paramsAt(effect, position01) as unknown as FireParams;
      renderFire(buffer, params, { frameIndexInEffect: f, positionInEffect01: position01, seed }, state);
    }
  } else if (effect.name === "Meteors") {
    const state = createMeteorsState(seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as MeteorsParams;
      renderMeteors(buffer, palette, params, state);
    }
  } else if (effect.name === "Snowflakes") {
    const state = createSnowflakesState(buffer.width, buffer.height, 5, seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as SnowflakesParams;
      renderSnowflakes(buffer, palette, params, state);
    }
  } else if (effect.name === "Strobe") {
    const state = createStrobeState(seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as StrobeParams;
      renderStrobe(buffer, palette, params, state);
    }
  } else if (effect.name === "Snow Storm") {
    const state = createSnowStormState(buffer.width, buffer.height, paramsAt(effect, 0) as unknown as SnowStormParams, seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as SnowStormParams;
      renderSnowStorm(buffer, palette, params, state);
    }
  } else if (effect.name === "Life") {
    const state = createLifeState(buffer.width, buffer.height, paramsAt(effect, 0) as unknown as LifeParams, seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as LifeParams;
      renderLife(buffer, palette, params, state);
    }
  }
}

// The Persistent layer setting: "does not clear the display buffer before rendering each frame.
// The result is the preview frame remains until overwritten by a subsequent frame."
//
// A stateless effect is a pure function of its frame, so persistence can only be produced by
// actually drawing every frame from the effect's start into one buffer - which is what this
// does. Stateful effects already replay this way, so they need nothing extra; a persistent
// stateful effect is simply its normal replay.
//
// The cost is linear in how far into the effect the playhead is, the same cost stateful effects
// already pay, and it is only paid by layers that ask for it.
function renderPersistent(
  buffer: RenderBuffer,
  palette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  frameMs: number,
  seed: number,
  audio: AudioSeries | undefined,
): void {
  const framesElapsed = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));
  const cap = Math.min(framesElapsed, MAX_PERSISTENT_FRAMES);
  for (let f = framesElapsed - cap; f <= framesElapsed; f++) {
    renderStateless(buffer, palette, effect, effect.startMs + f * frameMs, seed, audio);
  }
}

// Long effects would otherwise make a single scrub replay tens of thousands of frames. Past this
// many the oldest traces have been painted over many times anyway, so the visible result is the
// same and the cost stops growing.
const MAX_PERSISTENT_FRAMES = 600;

// Renders one row (model or group) at a given playhead time: finds effects active at atMs
// (row.effects array order = layer order, bottom-to-top, Normal blend - M2's data model has
// no explicit layer index yet), composites via the M3 layer stack, and maps to node colors.
// `audio` is the analysed track (audio.ts); omit it and audio-reactive effects see silence.
export function renderRowAtMs(
  row: RenderableRow,
  atMs: number,
  frameMs: number,
  seed: number,
  palette: RGBA[],
  audio?: AudioSeries,
): RGBA[] {
  const active = row.effects.filter((e) => atMs >= e.startMs && atMs < e.endMs).slice(-MAX_LAYERS);
  if (active.length === 0) {
    return row.geometry.nodes.map(() => rgba(0, 0, 0, 0));
  }

  const layers: NodeLayerSpec[] = active.map((effect) => ({
    // The render style reshapes the buffer this effect draws into, and re-points the nodes at
    // it (renderStyle.ts). Nothing in the effect changes.
    geometry: applyRenderStyle(row.geometry, effect.layer?.renderStyle),
    render: (buffer: RenderBuffer) => {
      // Layer settings wrap the effect rather than post-processing the model: a sub-buffer hands
      // the effect a smaller canvas to compose itself into, instead of cropping a full-size
      // render down to it (layerSettings.ts).
      renderWithLayerSettings(buffer, effect.layer, (target) => {
        if (STATEFUL_EFFECTS.has(effect.name)) renderStateful(target, palette, effect, atMs, frameMs, seed);
        else if (effect.layer?.persistent) renderPersistent(target, palette, effect, atMs, frameMs, seed, audio);
        else renderStateless(target, palette, effect, atMs, seed, audio);
        if (effect.transition) applyTransitions(target, effect, atMs, effect.transition);
      });
    },
    blendMode: effect.blendMode ?? "Normal",
    effectMixThreshold: effect.mix ?? 0,
  }));

  return renderLayerStackToNodes(row.geometry.nodes.length, layers);
}

export interface RowSequencer {
  renderFrameAt(atMs: number): RGBA[];
}

// Sequential-sweep variant of renderRowAtMs for full exports (fseq render etc). renderRowAtMs
// is correct for random-access scrubbing (a live preview seeking the playhead) but replays
// every stateful effect (Fire/Meteors/Snowflakes/Strobe) from its start on every call - fine
// for one-off queries, but a full N-frame sweep calling it N times is O(N^2) since frame k
// replays k inner frames. This carries each stateful effect's state incrementally across
// sequential calls instead, turning that into O(N) - see DECISIONS.md M9 perf note. The
// state lives entirely in each effect's own State object (buffer passed to render*() is a
// fresh per-call scratch canvas either way, not where physics persists), so replaying frames
// 0..N one-at-a-time via stored state produces byte-identical output to the original
// replay-from-start loop, just without redoing frames 0..(k-1) on every call.
// Caller MUST call renderFrameAt with strictly increasing atMs, one call per frame, in order.
export function createRowSequencer(
  row: RenderableRow,
  frameMs: number,
  seed: number,
  palette: RGBA[],
  audio?: AudioSeries,
): RowSequencer {
  // Keyed by index into row.effects for a stateful effect's own state, and by "persist:<index>"
  // for a persistent layer's kept buffer - two different things that both live for as long as
  // the sequencer does and are both scoped to one layer.
  const statefulStates = new Map<number | string, unknown>();

  function renderFrameAt(atMs: number): RGBA[] {
    const activeWithIndex = row.effects
      .map((effect, index) => ({ effect, index }))
      .filter(({ effect }) => atMs >= effect.startMs && atMs < effect.endMs)
      .slice(-MAX_LAYERS);

    if (activeWithIndex.length === 0) {
      return row.geometry.nodes.map(() => rgba(0, 0, 0, 0));
    }

    const layers: NodeLayerSpec[] = activeWithIndex.map(({ effect, index }) => ({
      geometry: applyRenderStyle(row.geometry, effect.layer?.renderStyle),
      render: (buffer: RenderBuffer) => {
        renderWithLayerSettings(buffer, effect.layer, (target) => {
          if (STATEFUL_EFFECTS.has(effect.name)) {
            renderStatefulIncremental(target, palette, effect, atMs, frameMs, seed, index, statefulStates);
          } else if (effect.layer?.persistent) {
            // Sequential export walks the frames in order anyway, so persistence here is just a
            // matter of keeping the buffer around instead of replaying into a fresh one.
            const key = `persist:${index}`;
            let kept = statefulStates.get(key) as RenderBuffer | undefined;
            if (!kept || kept.width !== target.width || kept.height !== target.height) {
              kept = new RenderBuffer(target.width, target.height);
              statefulStates.set(key, kept);
            }
            renderStateless(kept, palette, effect, atMs, seed, audio);
            for (let y = 0; y < target.height; y++) {
              for (let x = 0; x < target.width; x++) target.setPixel(x, y, kept.getPixel(x, y));
            }
          } else {
            renderStateless(target, palette, effect, atMs, seed, audio);
          }
          if (effect.transition) applyTransitions(target, effect, atMs, effect.transition);
        });
      },
      blendMode: effect.blendMode ?? "Normal",
      effectMixThreshold: effect.mix ?? 0,
    }));

    return renderLayerStackToNodes(row.geometry.nodes.length, layers);
  }

  return { renderFrameAt };
}

function renderStatefulIncremental(
  buffer: RenderBuffer,
  rowPalette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  frameMs: number,
  seed: number,
  key: number,
  states: Map<number | string, unknown>,
): void {
  const palette = effect.palette ?? rowPalette;
  const duration = effect.endMs - effect.startMs || 1;
  const framesElapsed = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));
  const position01 = Math.min(1, (framesElapsed * frameMs) / duration);
  const params = paramsAt(effect, position01);

  if (effect.name === "Fire") {
    let state = states.get(key) as ReturnType<typeof createFireState> | undefined;
    if (!state) {
      state = createFireState(buffer.width, buffer.height, seed);
      states.set(key, state);
    }
    renderFire(buffer, params as unknown as FireParams, { frameIndexInEffect: framesElapsed, positionInEffect01: position01, seed }, state);
  } else if (effect.name === "Meteors") {
    let state = states.get(key) as ReturnType<typeof createMeteorsState> | undefined;
    if (!state) {
      state = createMeteorsState(seed);
      states.set(key, state);
    }
    renderMeteors(buffer, palette, params as unknown as MeteorsParams, state);
  } else if (effect.name === "Snowflakes") {
    let state = states.get(key) as ReturnType<typeof createSnowflakesState> | undefined;
    if (!state) {
      state = createSnowflakesState(buffer.width, buffer.height, 5, seed);
      states.set(key, state);
    }
    renderSnowflakes(buffer, palette, params as unknown as SnowflakesParams, state);
  } else if (effect.name === "Strobe") {
    let state = states.get(key) as ReturnType<typeof createStrobeState> | undefined;
    if (!state) {
      state = createStrobeState(seed);
      states.set(key, state);
    }
    renderStrobe(buffer, palette, params as unknown as StrobeParams, state);
  } else if (effect.name === "Snow Storm") {
    const snowParams = params as unknown as SnowStormParams;
    let state = states.get(key) as SnowStormState | undefined;
    if (!state) {
      state = createSnowStormState(buffer.width, buffer.height, snowParams, seed);
      states.set(key, state);
    }
    renderSnowStorm(buffer, palette, snowParams, state);
  } else if (effect.name === "Life") {
    const lifeParams = params as unknown as LifeParams;
    let state = states.get(key) as LifeState | undefined;
    if (!state) {
      state = createLifeState(buffer.width, buffer.height, lifeParams, seed);
      states.set(key, state);
    }
    renderLife(buffer, palette, lifeParams, state);
  }
}

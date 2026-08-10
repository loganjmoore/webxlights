import type { RGBA } from "./color";
import { rgba } from "./color";
import { RenderBuffer } from "./renderBuffer";
import type { ModelGeometry } from "./models/types";
import { renderLayerStack, type LayerSpec } from "./layerStack";
import { bufferToNodeColors } from "./nodeMapping";
import type { BlendMode } from "./blend";
import { audioFrameAt, type AudioSeries } from "./audio";
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
import type { FrameContext } from "./effects/types";
import { resolveParamsAtPosition } from "./valueCurve";
import { applyTransitions, type TransitionSpec } from "./transition";

export interface RenderableEffect {
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, unknown>;
  transition?: TransitionSpec;
}

export interface RenderableRow {
  geometry: ModelGeometry;
  effects: RenderableEffect[];
}

const MAX_LAYERS = 5;

// Effects with per-frame state (heat map / particle list) that must be simulated forward
// frame-by-frame from the effect's start to reach `atMs` - correct for a scrubbing preview
// (not a real-time constraint), cheap at typical effect lengths (a few hundred frames).
const STATEFUL_EFFECTS = new Set(["Fire", "Meteors", "Snowflakes", "Strobe"]);

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
  palette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  seed: number,
  audio: AudioSeries | undefined,
): void {
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
  palette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  frameMs: number,
  seed: number,
): void {
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
  }
}

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

  const layers: LayerSpec[] = active.map((effect) => ({
    render: (buffer: RenderBuffer) => {
      if (STATEFUL_EFFECTS.has(effect.name)) renderStateful(buffer, palette, effect, atMs, frameMs, seed);
      else renderStateless(buffer, palette, effect, atMs, seed, audio);
      if (effect.transition) applyTransitions(buffer, effect, atMs, effect.transition);
    },
    blendMode: "Normal" as BlendMode,
    effectMixThreshold: 0,
  }));

  const composited = renderLayerStack(row.geometry.width, row.geometry.height, layers);
  return bufferToNodeColors(composited, row.geometry);
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
  const statefulStates = new Map<number, unknown>(); // keyed by index into row.effects

  function renderFrameAt(atMs: number): RGBA[] {
    const activeWithIndex = row.effects
      .map((effect, index) => ({ effect, index }))
      .filter(({ effect }) => atMs >= effect.startMs && atMs < effect.endMs)
      .slice(-MAX_LAYERS);

    if (activeWithIndex.length === 0) {
      return row.geometry.nodes.map(() => rgba(0, 0, 0, 0));
    }

    const layers: LayerSpec[] = activeWithIndex.map(({ effect, index }) => ({
      render: (buffer: RenderBuffer) => {
        if (STATEFUL_EFFECTS.has(effect.name)) {
          renderStatefulIncremental(buffer, palette, effect, atMs, frameMs, seed, index, statefulStates);
        } else {
          renderStateless(buffer, palette, effect, atMs, seed, audio);
        }
        if (effect.transition) applyTransitions(buffer, effect, atMs, effect.transition);
      },
      blendMode: "Normal" as BlendMode,
      effectMixThreshold: 0,
    }));

    const composited = renderLayerStack(row.geometry.width, row.geometry.height, layers);
    return bufferToNodeColors(composited, row.geometry);
  }

  return { renderFrameAt };
}

function renderStatefulIncremental(
  buffer: RenderBuffer,
  palette: RGBA[],
  effect: RenderableEffect,
  atMs: number,
  frameMs: number,
  seed: number,
  key: number,
  states: Map<number, unknown>,
): void {
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
  }
}

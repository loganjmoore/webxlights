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
import { renderMorph, type MorphParams } from "./effects/morph";
import { renderKaleidoscope, type KaleidoscopeParams } from "./effects/kaleidoscope";
import { renderWarp, type WarpParams } from "./effects/warp";
import { renderAdjust, type AdjustParams } from "./effects/adjust";
import { renderSketch, type SketchParams } from "./effects/sketch";
import { createTendrilsState, renderTendrils, type TendrilsParams, type TendrilsState } from "./effects/tendrils";
import { renderState, type StateParams } from "./effects/state";
import { renderPiano, type PianoParams } from "./effects/piano";
import { renderFaces, type FacesParams } from "./effects/faces";
import type { EffectData, FrameContext } from "./effects/types";
import type { ModelNode } from "./models/types";
import { resolveParamsAtPosition } from "./valueCurve";
import {
  acrossAt,
  hasSpatialCurve,
  resolvePalette,
  sampleCountFor,
  spatialAxisFor,
  type PaletteEntry,
} from "./colorCurve";
import { applyTransitions, type TransitionSpec } from "./transition";

export interface RenderableEffect {
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, unknown>;
  transition?: TransitionSpec;
  // Per-effect color override (real xLights' Color tab) - falls back to the row's own palette
  // (the app-wide default, until a model/group-level palette exists) when unset. A swatch may be
  // a plain colour or a *colour curve*, which changes over the effect or across the model
  // (colorCurve.ts); it is collapsed to a plain colour before any effect sees it.
  palette?: PaletteEntry[];
  // Real xLights' Layer Blending panel: how this effect's layer composites onto the layers
  // below it (default "Normal" = fully opaque overwrite) and the "Mix" slider some blend
  // modes read as their reveal/fade threshold (see blend.ts's blendPixel).
  blendMode?: BlendMode;
  mix?: number; // 0..1
  // Real xLights' Layer Settings panel: transformation, blur and sub-buffer. These sit between
  // the effect and the model, so they apply to every effect without any effect knowing
  // (layerSettings.ts).
  layer?: LayerSettings;
  // What the label-driven effects (State, Piano) need and their parameters can't carry: the cells
  // of the timing track this effect names, and the model's own state definitions. Resolved by the
  // caller, because a row renders in isolation and knows nothing of the sequence around it.
  data?: EffectData;
}

export interface RenderableRow {
  geometry: ModelGeometry;
  effects: RenderableEffect[];
}

const MAX_LAYERS = 5;

// What a stateless render needs beyond its own params: where the model's nodes sit in the buffer,
// and how long a frame is. Only the label-driven effects read either, so they travel together in
// one bag rather than as two more positional arguments on every call.
interface StatelessExtras {
  nodes?: readonly ModelNode[];
  frameMs?: number;
}

// Effects with per-frame state (heat map / particle list) that must be simulated forward
// frame-by-frame from the effect's start to reach `atMs` - correct for a scrubbing preview
// (not a real-time constraint), cheap at typical effect lengths (a few hundred frames).
const STATEFUL_EFFECTS = new Set(["Fire", "Meteors", "Snowflakes", "Strobe", "Snow Storm", "Life", "Tendrils"]);

// Morph cross-fades one layer into the one below it "during the length of the timing cell that
// the effects are in", so its mix is how far through the effect the playhead is rather than a
// slider position. Every other mode keeps the slider.
function mixFor(effect: RenderableEffect, atMs: number): number {
  return effect.blendMode === "Morph" ? positionOf(effect, atMs) : (effect.mix ?? 0);
}

// The two frame controls from the Layer Blending panel (layerSettings.ts). Both are about *when*
// a layer shows rather than how it combines, so they are applied by moving or withholding the
// moment the effect is rendered at, before anything else happens.
//
// Returns null when the layer is suppressed at this moment, which the caller renders as nothing.
function frameControlledMs(effect: RenderableEffect, atMs: number, frameMs: number): number | null {
  const frame = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));
  const suppress = effect.layer?.suppressUntilFrame ?? 0;
  if (suppress > 0 && frame < suppress) return null;
  const freeze = effect.layer?.freezeAtFrame;
  if (freeze !== undefined && freeze >= 0 && frame > freeze) return effect.startMs + freeze * frameMs;
  return atMs;
}

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
  extras: StatelessExtras = {},
): void {
  const palette = rowPalette; // already resolved for this frame and position (colorCurve.ts)
  const positionInEffect01 = positionOf(effect, atMs);
  const frameIndexInEffect = 0; // shimmer/parity-only field; scrubbing doesn't track frame parity
  // Left undefined when the sequence has no analysed track, so audio-reactive effects can tell
  // "no audio loaded" apart from "this frame of the song is silent".
  const ctx: FrameContext = {
    frameIndexInEffect,
    positionInEffect01,
    seed,
    audio: audio ? audioFrameAt(audio, atMs) : undefined,
    // The label-driven effects need real time and real nodes; everything else ignores both.
    clock: { atMs, startMs: effect.startMs, endMs: effect.endMs, frameMs: extras.frameMs ?? 50 },
    data: effect.data,
    nodes: extras.nodes,
  };
  const params = paramsAt(effect, positionInEffect01);

  switch (effect.name) {
    case "State":
      renderState(buffer, palette, params as unknown as StateParams, ctx);
      break;
    case "Piano":
      renderPiano(buffer, palette, params as unknown as PianoParams, ctx);
      break;
    case "Faces":
      renderFaces(buffer, palette, params as unknown as FacesParams, ctx);
      break;
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
    case "Morph":
      renderMorph(buffer, palette, params as unknown as MorphParams, ctx);
      break;
    // The canvas effects. They take no palette because they don't draw - the buffer they are
    // handed already holds what the layers underneath produced, and they rewrite it.
    case "Kaleidoscope":
      renderKaleidoscope(buffer, params as unknown as KaleidoscopeParams);
      break;
    case "Warp":
      renderWarp(buffer, params as unknown as WarpParams, ctx);
      break;
    case "Adjust":
      renderAdjust(buffer, params as unknown as AdjustParams);
      break;
    case "Sketch":
      renderSketch(buffer, palette, params as unknown as SketchParams, ctx);
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
  audio: AudioSeries | undefined,
): void {
  const palette = rowPalette; // already resolved (colorCurve.ts)
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
  } else if (effect.name === "Tendrils") {
    const state = createTendrilsState(buffer.width, buffer.height, paramsAt(effect, 0) as unknown as TendrilsParams, seed);
    for (let f = 0; f <= framesElapsed; f++) {
      const at = effect.startMs + f * frameMs;
      const params = paramsAt(effect, Math.min(1, (f * frameMs) / duration)) as unknown as TendrilsParams;
      // The music movements read the same offline analysis every other audio-reactive effect
      // does, at the frame being replayed rather than at the playhead - otherwise the whole
      // replayed history would be driven by one instant of the song.
      renderTendrils(buffer, palette, params, state, audio ? audioFrameAt(audio, at) : undefined);
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
  nodes?: readonly ModelNode[],
): void {
  const framesElapsed = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));
  const cap = Math.min(framesElapsed, MAX_PERSISTENT_FRAMES);
  for (let f = framesElapsed - cap; f <= framesElapsed; f++) {
    renderStateless(buffer, palette, effect, effect.startMs + f * frameMs, seed, audio, { nodes, frameMs });
  }
}

// Long effects would otherwise make a single scrub replay tens of thousands of frames. Past this
// many the oldest traces have been painted over many times anyway, so the visible result is the
// same and the cost stops growing.
const MAX_PERSISTENT_FRAMES = 600;

// Collapses colour curves around one layer's render (colorCurve.ts).
//
// A *time* curve is resolved once for the frame, so every effect gains it for free - the same
// trick value curves use for numeric params.
//
// A *spatial* curve can't be: within a single frame the swatch is a different colour in different
// places, and making all 43 effects position-aware for one feature is not a trade worth taking.
// Instead the effect is rendered a few times, each with the palette resolved at a different point
// along the curve's axis, and each destination pixel is taken from - or blended between - the
// renders nearest its own position. That is exact for any effect whose output is linear in its
// palette (an effect picks a swatch and scales it, which is nearly all of them) and close for the
// rest. The extra renders are only paid for by a layer that actually uses a spatial curve.
function renderWithColorCurves(
  target: RenderBuffer,
  palette: PaletteEntry[],
  position01: number,
  draw: (buffer: RenderBuffer, resolved: RGBA[]) => void,
): void {
  if (!hasSpatialCurve(palette)) {
    draw(target, resolvePalette(palette, position01));
    return;
  }

  const samples = sampleCountFor(palette);
  const { direction, blend } = spatialAxisFor(palette);
  const renders: RenderBuffer[] = [];
  for (let s = 0; s < samples; s++) {
    const across = samples > 1 ? s / (samples - 1) : 0;
    const buffer = new RenderBuffer(target.width, target.height);
    draw(buffer, resolvePalette(palette, position01, across));
    renders.push(buffer);
  }

  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      const across = acrossAt(direction, x, y, target.width, target.height);
      const scaled = across * (samples - 1);
      const lower = Math.min(samples - 1, Math.floor(scaled));
      // "None" is the manual's sharp change, so it snaps to the nearer render rather than
      // blending across the boundary the curve deliberately made hard.
      if (blend === "None") {
        target.setPixel(x, y, renders[Math.round(scaled)]!.getPixel(x, y));
        continue;
      }
      const upper = Math.min(samples - 1, lower + 1);
      const f = scaled - lower;
      const a = renders[lower]!.getPixel(x, y);
      const b = renders[upper]!.getPixel(x, y);
      target.setPixel(x, y, rgba(
        Math.round(a.r + (b.r - a.r) * f),
        Math.round(a.g + (b.g - a.g) * f),
        Math.round(a.b + (b.b - a.b) * f),
        Math.round(a.a + (b.a - a.a) * f),
      ));
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

  const layers: NodeLayerSpec[] = active.map((effect) => {
    // The render style reshapes the buffer this effect draws into, and re-points the nodes at
    // it (renderStyle.ts). Nothing in the effect changes.
    const geometry = applyRenderStyle(row.geometry, effect.layer?.renderStyle);
    return {
      geometry,
      render: (buffer: RenderBuffer) => {
        // Layer settings wrap the effect rather than post-processing the model: a sub-buffer hands
        // the effect a smaller canvas to compose itself into, instead of cropping a full-size
        // render down to it (layerSettings.ts).
        const shownAt = frameControlledMs(effect, atMs, frameMs);
        if (shownAt === null) return; // suppressed for now: the layer renders as nothing
        renderWithLayerSettings(buffer, effect.layer, (target) => {
          renderWithColorCurves(target, effect.palette ?? palette, positionOf(effect, shownAt), (paint, colors) => {
            if (STATEFUL_EFFECTS.has(effect.name)) renderStateful(paint, colors, effect, shownAt, frameMs, seed, audio);
            else if (effect.layer?.persistent) renderPersistent(paint, colors, effect, shownAt, frameMs, seed, audio, geometry.nodes);
            else renderStateless(paint, colors, effect, shownAt, seed, audio, { nodes: geometry.nodes, frameMs });
          });
          if (effect.transition) applyTransitions(target, effect, atMs, effect.transition);
        });
      },
      blendMode: effect.blendMode ?? "Normal",
      effectMixThreshold: mixFor(effect, atMs),
    };
  });

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

    const layers: NodeLayerSpec[] = activeWithIndex.map(({ effect, index }) => {
      const geometry = applyRenderStyle(row.geometry, effect.layer?.renderStyle);
      return {
        geometry,
        render: (buffer: RenderBuffer) => {
          const shownAt = frameControlledMs(effect, atMs, frameMs);
          if (shownAt === null) return; // suppressed for now: the layer renders as nothing
          renderWithLayerSettings(buffer, effect.layer, (target) => {
            renderWithColorCurves(target, effect.palette ?? palette, positionOf(effect, shownAt), (paint, colors) => {
              if (STATEFUL_EFFECTS.has(effect.name)) {
                renderStatefulIncremental(paint, colors, effect, shownAt, frameMs, seed, index, statefulStates, audio);
              } else if (effect.layer?.persistent) {
                // Sequential export walks the frames in order anyway, so persistence here is just a
                // matter of keeping the buffer around instead of replaying into a fresh one.
                const key = `persist:${index}`;
                let kept = statefulStates.get(key) as RenderBuffer | undefined;
                if (!kept || kept.width !== paint.width || kept.height !== paint.height) {
                  kept = new RenderBuffer(paint.width, paint.height);
                  statefulStates.set(key, kept);
                }
                renderStateless(kept, colors, effect, shownAt, seed, audio, { nodes: geometry.nodes, frameMs });
                for (let y = 0; y < paint.height; y++) {
                  for (let x = 0; x < paint.width; x++) paint.setPixel(x, y, kept.getPixel(x, y));
                }
              } else {
                renderStateless(paint, colors, effect, shownAt, seed, audio, { nodes: geometry.nodes, frameMs });
              }
            });
            if (effect.transition) applyTransitions(target, effect, atMs, effect.transition);
          });
        },
        blendMode: effect.blendMode ?? "Normal",
        effectMixThreshold: mixFor(effect, atMs),
      };
    });

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
  audio: AudioSeries | undefined,
): void {
  const palette = rowPalette; // already resolved (colorCurve.ts)
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
  } else if (effect.name === "Tendrils") {
    const tendrilParams = params as unknown as TendrilsParams;
    let state = states.get(key) as TendrilsState | undefined;
    if (!state) {
      state = createTendrilsState(buffer.width, buffer.height, tendrilParams, seed);
      states.set(key, state);
    }
    renderTendrils(buffer, palette, tendrilParams, state, audio ? audioFrameAt(audio, atMs) : undefined);
  }
}

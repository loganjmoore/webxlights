import type { RGBA } from "./color";
import { rgba } from "./color";
import { RenderBuffer } from "./renderBuffer";
import type { ModelGeometry } from "./models/types";
import { renderLayerStack, type LayerSpec } from "./layerStack";
import { bufferToNodeColors } from "./nodeMapping";
import type { BlendMode } from "./blend";
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

export interface RenderableEffect {
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, unknown>;
}

export interface RenderableRow {
  geometry: ModelGeometry;
  effects: RenderableEffect[];
}

const MAX_LAYERS = 5;

// Effects with per-frame state (heat map / particle list) that must be simulated forward
// frame-by-frame from the effect's start to reach `atMs` - correct for a scrubbing preview
// (not a real-time constraint), cheap at typical effect lengths (a few hundred frames).
const STATEFUL_EFFECTS = new Set(["Fire", "Meteors", "Snowflakes"]);

function renderStateless(buffer: RenderBuffer, palette: RGBA[], effect: RenderableEffect, atMs: number, seed: number): void {
  const duration = effect.endMs - effect.startMs || 1;
  const positionInEffect01 = Math.max(0, Math.min(1, (atMs - effect.startMs) / duration));
  const frameIndexInEffect = 0; // shimmer/parity-only field; scrubbing doesn't track frame parity
  const ctx = { frameIndexInEffect, positionInEffect01, seed };

  switch (effect.name) {
    case "On":
      renderOn(buffer, palette, effect.params as unknown as OnParams, ctx);
      break;
    case "Bars":
      renderBars(buffer, palette, effect.params as unknown as BarsParams, ctx);
      break;
    case "Color Wash":
      renderColorWash(buffer, palette, effect.params as unknown as ColorWashParams, ctx);
      break;
    case "Butterfly":
      renderButterfly(buffer, palette, effect.params as unknown as ButterflyParams, ctx);
      break;
    case "Spirals":
      renderSpirals(buffer, palette, effect.params as unknown as SpiralsParams, ctx);
      break;
    case "Twinkle":
      renderTwinkle(buffer, palette, effect.params as unknown as TwinkleParams, ctx);
      break;
    case "SingleStrand":
      renderSingleStrandChase(buffer, palette, effect.params as unknown as SingleStrandChaseParams, ctx);
      break;
    default:
      break; // unknown effect name: leave the layer transparent rather than throw
  }
}

function renderStateful(buffer: RenderBuffer, palette: RGBA[], effect: RenderableEffect, atMs: number, frameMs: number, seed: number): void {
  const duration = effect.endMs - effect.startMs || 1;
  const framesElapsed = Math.max(0, Math.floor((atMs - effect.startMs) / frameMs));

  if (effect.name === "Fire") {
    const state = createFireState(buffer.width, buffer.height, seed);
    const params = effect.params as unknown as FireParams;
    for (let f = 0; f <= framesElapsed; f++) {
      renderFire(buffer, params, { frameIndexInEffect: f, positionInEffect01: (f * frameMs) / duration, seed }, state);
    }
  } else if (effect.name === "Meteors") {
    const state = createMeteorsState(seed);
    const params = effect.params as unknown as MeteorsParams;
    for (let f = 0; f <= framesElapsed; f++) renderMeteors(buffer, palette, params, state);
  } else if (effect.name === "Snowflakes") {
    const params = effect.params as unknown as SnowflakesParams;
    const state = createSnowflakesState(buffer.width, buffer.height, 5, seed);
    for (let f = 0; f <= framesElapsed; f++) renderSnowflakes(buffer, palette, params, state);
  }
}

// Renders one row (model or group) at a given playhead time: finds effects active at atMs
// (row.effects array order = layer order, bottom-to-top, Normal blend - M2's data model has
// no explicit layer index yet), composites via the M3 layer stack, and maps to node colors.
export function renderRowAtMs(row: RenderableRow, atMs: number, frameMs: number, seed: number, palette: RGBA[]): RGBA[] {
  const active = row.effects.filter((e) => atMs >= e.startMs && atMs < e.endMs).slice(-MAX_LAYERS);
  if (active.length === 0) {
    return row.geometry.nodes.map(() => rgba(0, 0, 0, 0));
  }

  const layers: LayerSpec[] = active.map((effect) => ({
    render: (buffer: RenderBuffer) => {
      if (STATEFUL_EFFECTS.has(effect.name)) renderStateful(buffer, palette, effect, atMs, frameMs, seed);
      else renderStateless(buffer, palette, effect, atMs, seed);
    },
    blendMode: "Normal" as BlendMode,
    effectMixThreshold: 0,
  }));

  const composited = renderLayerStack(row.geometry.width, row.geometry.height, layers);
  return bufferToNodeColors(composited, row.geometry);
}

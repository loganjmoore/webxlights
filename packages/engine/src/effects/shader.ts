import type { RGBA } from "../color";
import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";
import { compileCached, type ShaderFrameRequest } from "../shaderRuntime";

// xLights' Shader effect: point a GLSL fragment shader at a model and let it draw.
//
// Everything hard about this lives elsewhere - ISF parsing in packages/formats, actually running
// GLSL in the host (shaderRuntime.ts). What is left here is the part that is genuinely this
// effect's business: turning the sequencer's idea of time into the uniforms a shader expects, and
// getting the pixels the shader produced into a RenderBuffer the rest of the pipeline understands.

export interface ShaderParams {
  /** The GLSL body. Carried on the effect so a sequence renders without needing the library. */
  source?: string;
  /** ISF INPUTS the user has set, by name. Anything absent falls back to the shader's default. */
  inputs?: Record<string, number | boolean | number[]>;
  /**
   * Multiplies the shader's own sense of time.
   *
   * Kept out of `inputs` because it is not the shader's parameter - it is ours, and it applies to
   * every shader whether or not its author thought about speed.
   */
  speed?: number;
  /** 0..100, how much of the layer below shows through. */
  transparencyPct?: number;
  /**
   * Which shader in the library this came from, for the UI to show provenance.
   *
   * Not used to fetch anything at render time: a sequence that renders only when the library is
   * reachable is a sequence that stops working the moment a shader is deleted or made private.
   */
  shaderId?: number | null;
  /**
   * The names of the shader's `"TYPE": "color"` INPUTS, in declaration order.
   *
   * Real xLights fills each declared colour input from the effect's palette, in the order they
   * were declared, wrapping when there are more inputs than colours - the DEFAULT in the header
   * is ignored (ShaderEffect.cpp, SHADER_PARM_COLOUR). Doing the same here is what makes "use
   * the user's colours" mean one thing in both programs. Carried on the effect because at render
   * time only the GLSL body is left and declaration order is not recoverable from it.
   */
  colorInputs?: string[];
}

/**
 * How long a frame is worth in shader time.
 *
 * ISF shaders are written against wall-clock seconds, so a shader looks the way its author meant
 * only if TIME advances in real seconds regardless of the sequence's frame rate.
 */
function timeSecondsFor(ctx: FrameContext, frameMs: number, speed: number): number {
  return (ctx.frameIndexInEffect * frameMs * speed) / 1000;
}

/**
 * What each colour input is worth, given the palette - xLights' rule exactly: declaration
 * order, wrapping at the palette length, alpha forced opaque. An empty palette changes nothing,
 * so the values already stored on the effect stand in.
 */
export function paletteColorValues(colorInputs: string[], palette: RGBA[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (palette.length === 0) return out;
  colorInputs.forEach((name, i) => {
    const c = palette[i % palette.length]!;
    out[name] = [c.r / 255, c.g / 255, c.b / 255, 1];
  });
  return out;
}

export function renderShader(
  buffer: RenderBuffer,
  palette: RGBA[],
  params: ShaderParams,
  ctx: FrameContext,
  frameMs = 50,
): void {
  const source = params.source;
  if (!source || source.trim() === "") return; // nothing chosen yet: leave the layer alone

  const compiled = compileCached(source);
  // A shader that won't compile, or a host that can't run one, renders as nothing rather than
  // throwing. A broken shader on one layer of one model must not take down the frame - the rest
  // of the show is still correct, and the sequencer surfaces the error next to the effect.
  if ("error" in compiled) return;

  const speed = params.speed ?? 1;
  const request: ShaderFrameRequest = {
    width: buffer.width,
    height: buffer.height,
    timeSeconds: timeSecondsFor(ctx, frameMs, speed),
    position01: ctx.positionInEffect01,
    frameIndex: ctx.frameIndexInEffect,
    palette,
    inputs: params.colorInputs?.length
      ? { ...(params.inputs ?? {}), ...paletteColorValues(params.colorInputs, palette) }
      : (params.inputs ?? {}),
  };

  const pixels = compiled.shader.render(request);
  if (!pixels) return;

  const alphaScale = 1 - Math.max(0, Math.min(100, params.transparencyPct ?? 0)) / 100;
  const expected = buffer.width * buffer.height * 4;
  // The host is asked for a specific size but is a foreign implementation; a short buffer would
  // otherwise read undefined and paint garbage.
  if (pixels.length < expected) return;

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const i = (y * buffer.width + x) * 4;
      const a = pixels[i + 3]! * alphaScale;
      if (a <= 0) continue; // transparent: let the layer below show, don't write black over it
      buffer.setPixel(x, y, rgba(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, Math.round(a)));
    }
  }
}

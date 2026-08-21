import type { RGBA } from "./color";

// The seam between "what a shader effect means" and "how GLSL actually runs".
//
// Every other effect in this engine is arithmetic - it runs anywhere TypeScript runs, which is
// what lets the whole effect set be tested in Node with no browser. GLSL is not: it needs a GPU
// and a WebGL context. Putting a WebGL call anywhere in packages/engine would make the engine
// unloadable under vitest and unusable from any future server-side render.
//
// So the engine declares what it needs and the app supplies it. `apps/web` installs a WebGL
// implementation at startup; Node installs nothing and shader effects render transparent, which
// is the same thing that happens for an unknown effect name and is a great deal better than
// throwing in the middle of a frame.
//
// This is a process-wide registry rather than a parameter threaded through renderRowAtMs, and
// that is a deliberate difference from how audio is passed. Audio is *data about one sequence*
// and belongs in the call. A GPU is a property of the process - there is exactly one, it does not
// vary per row, per frame or per sequence, and threading it through six call sites and their
// tests would be ceremony around a value that is always the same.

/** A shader compiled and ready to draw, as the host renderer represents it. */
export interface CompiledShader {
  /** Draws one frame into an RGBA byte array, row 0 at the *bottom* (RenderBuffer's convention). */
  render(request: ShaderFrameRequest): Uint8ClampedArray | null;
  dispose(): void;
}

export interface ShaderFrameRequest {
  width: number;
  height: number;
  /** Seconds since the effect started - ISF's TIME uniform. */
  timeSeconds: number;
  /** 0..1 across the effect, for shaders that want to know where they are in it. */
  position01: number;
  /** Frames since the effect started - ISF's FRAMEINDEX. */
  frameIndex: number;
  /** The row's palette, exposed so a shader can honour the colours the user picked. */
  palette: RGBA[];
  /** ISF INPUTS by name, already defaulted. */
  inputs: Record<string, number | boolean | number[]>;
}

export interface ShaderHost {
  /**
   * Compiles ISF GLSL, or returns an error string.
   *
   * Returning the message rather than throwing is what lets the sequencer show a user a compile
   * error next to their shader - which is essential when the shader was written by an AI from a
   * sentence, because the error is the feedback loop.
   */
  compile(source: string, key: string): { shader: CompiledShader } | { error: string };
}

let host: ShaderHost | null = null;

/** Installs the host that can actually run GLSL. Called once, by the app, at startup. */
export function setShaderHost(next: ShaderHost | null): void {
  host = next;
}

export function getShaderHost(): ShaderHost | null {
  return host;
}

/**
 * Compiled shaders, kept by source.
 *
 * Compiling GLSL is expensive and a sequence renders the same shader on every frame of an
 * effect - thousands of times for an export. Keyed by source text rather than by shader id so an
 * edit produces a new entry and a re-import of the same shader reuses one.
 */
const cache = new Map<string, { shader: CompiledShader } | { error: string }>();

const MAX_CACHED = 64;

export function compileCached(source: string): { shader: CompiledShader } | { error: string } {
  const existing = cache.get(source);
  if (existing) return existing;
  const current = host;
  if (!current) return { error: "no shader host installed" };

  const result = current.compile(source, `isf-${cache.size}`);
  // A bounded cache, because a user editing a shader in a loop produces a new source every
  // keystroke and each one holds a GL program until it is dropped.
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const evicted = cache.get(oldest);
      if (evicted && "shader" in evicted) evicted.shader.dispose();
      cache.delete(oldest);
    }
  }
  cache.set(source, result);
  return result;
}

/** Drops every compiled program. For tests, and for swapping the host at runtime. */
export function clearShaderCache(): void {
  for (const entry of cache.values()) if ("shader" in entry) entry.shader.dispose();
  cache.clear();
}

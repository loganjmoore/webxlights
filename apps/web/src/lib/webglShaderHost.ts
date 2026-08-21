import type { CompiledShader, ShaderFrameRequest, ShaderHost } from "@webxlights/engine";
import { parseIsf, type IsfInput } from "@webxlights/formats";

// Runs ISF shaders on the GPU and hands the pixels back to the engine.
//
// This is the implementation of the seam declared in engine/shaderRuntime.ts, and it lives in the
// app because it is the app that has a browser. One WebGL context is shared by every shader: a
// context is a scarce resource (browsers cap them somewhere around sixteen and start dropping the
// oldest), and a show with a dozen shader effects would otherwise lose them mid-render.
//
// Render buffers are small - a model is tens of pixels on a side - so the cost here is per-draw
// overhead rather than fill rate, and the things worth avoiding are recompiling and reallocating,
// both of which are cached below.

// ISF's own preamble. A shader written for ISF assumes these exist without declaring them, so
// they are prepended to every source rather than being the author's responsibility.
//
// isf_FragNormCoord is the important one: it is the normalised pixel position nearly every ISF
// shader is written in terms of, and RENDERSIZE the resolution it scales against.
export const ISF_PREAMBLE = `#version 300 es
precision highp float;

uniform vec2 RENDERSIZE;
uniform float TIME;
uniform float TIMEDELTA;
uniform int FRAMEINDEX;
uniform vec4 DATE;
// How many colours the user picked for this effect. Real xLights declares this for every shader
// (ShaderEffect.cpp, prependText), so declaring it here keeps the two dialects the same. The
// colours themselves arrive as the shader's own "TYPE": "color" INPUTS, filled from the palette
// in declaration order - which is xLights' mechanism, and the portable one. The old webXLights
// inventions PALETTE[8] / PALETTE_COUNT / PALETTE_AT() are gone on purpose: they never existed
// in xLights, so a shader using them was a webXLights-only fork of the format.
uniform int NUMCOLORS;

in vec2 isf_FragNormCoord;
out vec4 webxl_FragColor;
`;

// ISF shaders are written against GLSL ES 1.00 - they say gl_FragColor and varying, and many
// index arrays with a loop variable in ways ES 3.00 is stricter about. Rather than demand ES
// 3.00 sources (which would reject essentially every shader in the wild, and which an AI asked
// for "an ISF shader" would not produce either), the ES 1.00 spellings are aliased onto the ES
// 3.00 ones. This is the same trick ISF's own reference implementation uses.
export const COMPAT = `
#define gl_FragColor webxl_FragColor
#define texture2D texture
#define varying in
`;

/**
 * The uniforms a shader's own INPUTS become - the same mapping real xLights applies
 * (ShaderEffect.cpp ~line 1240): an ISF author declares inputs in the header and the host
 * declares the uniforms, so the body just uses them. A "long" gets a uniform only under the
 * same conditions xLights gives it one, because a shader that compiles here and not there is
 * exactly the divergence this file exists to avoid.
 */
export function inputUniformDeclarations(inputs: IsfInput[]): string {
  let out = "";
  for (const input of inputs) {
    switch (input.type) {
      case "float":
        out += `uniform float ${input.name};\n`;
        break;
      case "bool":
      case "event":
        out += `uniform bool ${input.name};\n`;
        break;
      case "long":
        if (input.min !== undefined || (input.labels?.length && input.values?.length)) {
          out += `uniform int ${input.name};\n`;
        }
        break;
      case "point2D":
        out += `uniform vec2 ${input.name};\n`;
        break;
      case "color":
        out += `uniform vec4 ${input.name};\n`;
        break;
      case "image":
        // xLights swaps an image input for its own texSampler; here it is an unbound sampler,
        // which samples black - the shader compiles and runs, it just sees no picture.
        out += `uniform sampler2D ${input.name};\n`;
        break;
    }
  }
  return out;
}

/**
 * The full fragment source this host compiles - preamble, compat defines, input uniforms, body.
 *
 * Exported (and kept pure) so the compile harness in tools/shader-check can compile *exactly*
 * what the app compiles, rather than a reimplementation that would drift.
 *
 * Accepts either a whole ISF file or a bare GLSL body. With a header, the INPUTS become uniform
 * declarations exactly as xLights makes them - the body must NOT declare its own, in either
 * program. A bare body (what effects saved before headers were kept hold) gets no declarations,
 * which is what those sources were written against. The preamble is spliced in after any leading
 * #version, because #version must be the first line of a GLSL source.
 */
export function webxlFragmentSource(source: string): string {
  let body = source;
  let declarations = "";
  try {
    const parsed = parseIsf(source);
    body = parsed.source;
    declarations = inputUniformDeclarations(parsed.inputs);
  } catch {
    // No ISF header: a bare body, compiled as it always was.
  }
  return `${ISF_PREAMBLE}${COMPAT}\n${declarations}${body.replace(/^\s*#version[^\n]*\n/, "")}`;
}

export const VERTEX = `#version 300 es
precision highp float;
in vec2 position;
out vec2 isf_FragNormCoord;
void main() {
  // position is a full-screen triangle pair in clip space; the normalised coordinate an ISF
  // shader reads is that mapped from [-1,1] to [0,1].
  isf_FragNormCoord = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function compileStage(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return "could not create shader";
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    return log.trim();
  }
  return shader;
}

class GlShader implements CompiledShader {
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private inputTypes: Map<string, number> | null = null;
  private pixels: Uint8ClampedArray | null = null;
  private size = { width: 0, height: 0 };

  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private target: RenderTarget;
  private vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext, program: WebGLProgram, target: RenderTarget, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.program = program;
    this.target = target;
    this.vao = vao;
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  /**
   * The GL type of each active uniform, so an input is uploaded as what the program declared.
   *
   * Needed because the declaration comes from the ISF header, not from the value: a "long"
   * input is an int uniform (the same as xLights declares) and a JS number sent with uniform1f
   * to an int location is an INVALID_OPERATION that silently leaves the uniform at zero.
   */
  private typeOf(name: string): number | undefined {
    if (!this.inputTypes) {
      this.inputTypes = new Map();
      const { gl, program } = this;
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (info) this.inputTypes.set(info.name.replace(/\[0\]$/, ""), info.type);
      }
    }
    return this.inputTypes.get(name);
  }

  render(request: ShaderFrameRequest): Uint8ClampedArray | null {
    const { gl } = this;
    const { width, height } = request;
    if (width <= 0 || height <= 0) return null;

    this.target.resize(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.location("RENDERSIZE"), width, height);
    gl.uniform1f(this.location("TIME"), request.timeSeconds);
    gl.uniform1f(this.location("TIMEDELTA"), 1 / 20);
    gl.uniform1i(this.location("FRAMEINDEX"), request.frameIndex);
    gl.uniform4f(this.location("DATE"), 0, 0, 0, request.timeSeconds);

    gl.uniform1i(this.location("NUMCOLORS"), request.palette.length);

    for (const [name, value] of Object.entries(request.inputs)) {
      const loc = this.location(name);
      if (!loc) continue; // an input the shader doesn't declare: harmless, skip it
      const type = this.typeOf(name);
      const scalar = typeof value === "boolean" ? (value ? 1 : 0) : typeof value === "number" ? value : null;
      if (scalar !== null) {
        // int and bool uniforms (long / bool / event inputs) take an integer upload; anything
        // else scalar is a float.
        if (type === gl.INT || type === gl.BOOL) gl.uniform1i(loc, Math.round(scalar));
        else gl.uniform1f(loc, scalar);
      } else if (Array.isArray(value)) {
        if (value.length >= 4) gl.uniform4f(loc, value[0]!, value[1]!, value[2]!, value[3]!);
        else if (value.length === 3) gl.uniform3f(loc, value[0]!, value[1]!, value[2]!);
        else if (value.length === 2) gl.uniform2f(loc, value[0]!, value[1]!);
        else if (value.length === 1) gl.uniform1f(loc, value[0]!);
      }
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.size.width !== width || this.size.height !== height || !this.pixels) {
      this.pixels = new Uint8ClampedArray(width * height * 4);
      this.size = { width, height };
    }
    // WebGL's framebuffer origin is bottom-left, which is also RenderBuffer's convention
    // (renderBuffer.ts: "origin bottom-left"), so the rows come back the right way up and no
    // flip is needed. That agreement is load-bearing - worth stating, because every other
    // canvas API in this app is top-left and the natural assumption is wrong here.
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels as unknown as Uint8Array);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.pixels;
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

/** An offscreen colour target, resized only when a model bigger than the last one turns up. */
class RenderTarget {
  framebuffer: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private width = 0;
  private height = 0;

  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height && this.framebuffer) return;
    const { gl } = this;
    if (!this.framebuffer) this.framebuffer = gl.createFramebuffer();
    if (!this.texture) this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.width = width;
    this.height = height;
  }
}

/**
 * Builds the host, or returns null where WebGL2 isn't available.
 *
 * Null rather than throwing: a browser without WebGL2 should show a show with every other effect
 * working and shader layers blank, not a blank page.
 */
export function createWebglShaderHost(): ShaderHost | null {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const gl = canvas?.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: false }) ?? null;
  if (!gl) return null;

  const target = new RenderTarget(gl);

  // One full-screen quad, shared by every shader - the geometry never changes, only the
  // fragment program does.
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.bindVertexArray(null);

  const vertex = compileStage(gl, gl.VERTEX_SHADER, VERTEX);
  if (typeof vertex === "string") return null;

  return {
    compile(source: string) {
      const fragment = compileStage(gl, gl.FRAGMENT_SHADER, webxlFragmentSource(source));
      if (typeof fragment === "string") return { error: fragment };

      const program = gl.createProgram();
      if (!program) return { error: "could not create program" };
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "position");
      gl.linkProgram(program);
      // The fragment stage is owned by the program once linked; detaching lets it be freed
      // when the program is deleted rather than living as long as the context.
      gl.detachShader(program, fragment);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? "unknown link error";
        gl.deleteProgram(program);
        return { error: log.trim() };
      }

      gl.bindVertexArray(vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      return { shader: new GlShader(gl, program, target, vao!) };
    },
  };
}

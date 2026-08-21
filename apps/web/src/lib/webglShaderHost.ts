import type { CompiledShader, ShaderFrameRequest, ShaderHost } from "@webxlights/engine";

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
const ISF_PREAMBLE = `#version 300 es
precision highp float;

uniform vec2 RENDERSIZE;
uniform float TIME;
uniform float TIMEDELTA;
uniform int FRAMEINDEX;
uniform vec4 DATE;
// The row's palette, so a shader can honour the colours the user picked rather than only the
// ones its author hard-coded. Not part of ISF - a webXLights addition, and the reason a
// generated shader can be told "use the sequence colours".
uniform vec4 PALETTE[8];
uniform int PALETTE_COUNT;

in vec2 isf_FragNormCoord;
out vec4 webxl_FragColor;

vec4 PALETTE_AT(int i) {
  return PALETTE[PALETTE_COUNT <= 0 ? 0 : int(mod(float(i), float(PALETTE_COUNT)))];
}
`;

// ISF shaders are written against GLSL ES 1.00 - they say gl_FragColor and varying, and many
// index arrays with a loop variable in ways ES 3.00 is stricter about. Rather than demand ES
// 3.00 sources (which would reject essentially every shader in the wild, and which an AI asked
// for "an ISF shader" would not produce either), the ES 1.00 spellings are aliased onto the ES
// 3.00 ones. This is the same trick ISF's own reference implementation uses.
const COMPAT = `
#define gl_FragColor webxl_FragColor
#define texture2D texture
#define varying in
`;

const VERTEX = `#version 300 es
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

const MAX_PALETTE = 8;

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

    const count = Math.min(request.palette.length, MAX_PALETTE);
    if (count > 0) {
      const flat = new Float32Array(MAX_PALETTE * 4);
      for (let i = 0; i < count; i++) {
        const c = request.palette[i]!;
        flat[i * 4] = c.r / 255;
        flat[i * 4 + 1] = c.g / 255;
        flat[i * 4 + 2] = c.b / 255;
        flat[i * 4 + 3] = c.a / 255;
      }
      gl.uniform4fv(this.location("PALETTE"), flat);
    }
    gl.uniform1i(this.location("PALETTE_COUNT"), count);

    for (const [name, value] of Object.entries(request.inputs)) {
      const loc = this.location(name);
      if (!loc) continue; // an input the shader doesn't declare: harmless, skip it
      if (typeof value === "boolean") gl.uniform1i(loc, value ? 1 : 0);
      else if (typeof value === "number") gl.uniform1f(loc, value);
      else if (Array.isArray(value)) {
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
      // The preamble is spliced in *after* any leading #version the author wrote, because
      // #version must be the first line of a GLSL source and ISF files sometimes carry one.
      const body = source.replace(/^\s*#version[^\n]*\n/, "");
      const full = `${ISF_PREAMBLE}${COMPAT}\n${body}`;
      const fragment = compileStage(gl, gl.FRAGMENT_SHADER, full);
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

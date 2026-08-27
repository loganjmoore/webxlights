// The shapes, the palette, and the GPU, shared by everything that renders a shader here.
//
// metrics.mjs and render.mjs both need to put a shader on a real WebGL2 context at real prop
// sizes with the real preamble. They differ only in what they do with the pixels afterwards -
// metrics.mjs reduces them to numbers, render.mjs draws them into a contact sheet - so the GL
// setup, the shape list and the palette live here rather than being written twice and drifting.

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

// The three prop shapes are EXACTLY the ones earlier rounds used, so this round's numbers stay
// comparable to the committed ones. screen-192x108 is the new fourth shape: the same file judged
// as a motion background, which is the ambition rather than the gate.
export const SHAPES = [
  { name: "roofline-60x1", width: 60, height: 1, scale: 12, kind: "prop" },
  { name: "megatree-16x50", width: 16, height: 50, scale: 8, kind: "prop" },
  { name: "matrix-32x32", width: 32, height: 32, scale: 10, kind: "prop" },
  { name: "screen-192x108", width: 192, height: 108, scale: 3, kind: "screen" },
];

// Red, blue, gold, green - an arbitrary user palette, deliberately containing two pairs of near
// complements. Filled into "TYPE": "color" INPUTS in declaration order, wrapping, which is the
// rule both real programs apply. A shader only survives this if it composes colours it was not
// designed around.
export const REGRESSION_PALETTE = [
  [1, 0.15, 0.15, 1],
  [0.15, 0.45, 1, 1],
  [1, 0.8, 0.25, 1],
  [0.25, 0.85, 0.45, 1],
];

/** This engine's frame period: 20 fps, 50 ms (packages/engine renderFrame). */
export const FPS = 20;

function chromiumPath() {
  if (process.env.SHADER_CHECK_CHROMIUM) return process.env.SHADER_CHECK_CHROMIUM;
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  return undefined; // playwright-core finds its own managed browser
}

export async function launchPage(viewport = { width: 1400, height: 900 }) {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    // Software WebGL: deterministic, and these runs must not depend on whatever GPU driver the
    // machine happens to have. Two people re-running this should get the same numbers.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport });
  await page.setContent("<html><body style='margin:0'></body></html>");
  return { browser, page };
}

/**
 * The in-page GL helper, installed as `window.__shaderGl`.
 *
 * Renders to an off-screen framebuffer at the prop's real size - never to a scaled canvas -
 * because every question here ("does it alias at 60x1?", "is it too dark?") is a question about
 * the actual pixels the engine would hand to the lights.
 *
 * Prefers an RGBA32F target: 8-bit readback cannot represent a NaN, and `nanFraction` has to be
 * a real measurement rather than a hopeful zero. Falls back to 8-bit when float targets are
 * unavailable, and says which one ran.
 */
const GL_SCRIPT = `
window.__initShaderGl = function (vertexSource) {
  const gl = document.createElement("canvas").getContext("webgl2", { antialias: false });
  if (!gl) throw new Error("no WebGL2 context");
  const floatOk = !!gl.getExtension("EXT_color_buffer_float");

  function stage(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      return { error: (gl.getShaderInfoLog(s) || "compile failed").replace(/\\u0000/g, "").trim() };
    }
    return { shader: s };
  }

  const v = stage(gl.VERTEX_SHADER, vertexSource);
  if (v.error) throw new Error("vertex stage: " + v.error);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const targets = new Map();
  let useFloat = floatOk;
  function target(w, h) {
    const key = w + "x" + h + (useFloat ? "f" : "b");
    const found = targets.get(key);
    if (found) return found;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (useFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      // A float target the driver will not actually render to is worse than no float target:
      // it fails silently. Drop to 8-bit and record that NaN can no longer be seen.
      if (useFloat) { useFloat = false; return target(w, h); }
      throw new Error("framebuffer incomplete at " + w + "x" + h);
    }
    const made = { fb, tex, w, h };
    targets.set(key, made);
    return made;
  }

  return {
    get floatTargets() { return useFloat; },

    build(fragmentSource) {
      const f = stage(gl.FRAGMENT_SHADER, fragmentSource);
      if (f.error) return { error: f.error };
      const p = gl.createProgram();
      gl.attachShader(p, v.shader);
      gl.attachShader(p, f.shader);
      gl.bindAttribLocation(p, 0, "position");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        return { error: (gl.getProgramInfoLog(p) || "link failed").replace(/\\u0000/g, "").trim() };
      }
      return { program: p };
    },

    /**
     * Renders one frame per entry in \`times\` and returns the raw RGBA buffers, GL row order
     * (bottom-up). Uniforms are set exactly as the app sets them.
     */
    frames(program, w, h, times, inputs, numColors, fps) {
      const t = target(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const cache = new Map();
      const uni = (n) => {
        if (!cache.has(n)) cache.set(n, gl.getUniformLocation(program, n));
        return cache.get(n);
      };

      const out = [];
      for (const time of times) {
        gl.uniform2f(uni("RENDERSIZE"), w, h);
        gl.uniform1f(uni("TIME"), time);
        gl.uniform1f(uni("TIMEDELTA"), 1 / fps);
        gl.uniform1i(uni("FRAMEINDEX"), Math.round(time * fps));
        gl.uniform1i(uni("NUMCOLORS"), numColors);
        gl.uniform4f(uni("DATE"), 0, 0, 0, time);
        for (const name of Object.keys(inputs)) {
          const loc = uni(name);
          if (!loc) continue;
          const val = inputs[name];
          if (typeof val === "boolean") gl.uniform1i(loc, val ? 1 : 0);
          else if (typeof val === "number") {
            // ints and floats both arrive as numbers; try float, fall back to int when the
            // uniform turns out to be an int (an ISF "long").
            gl.getError();
            gl.uniform1f(loc, val);
            if (gl.getError() !== gl.NO_ERROR) gl.uniform1i(loc, Math.round(val));
          } else if (Array.isArray(val)) {
            if (val.length >= 4) gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
            else if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
          }
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        const px = useFloat ? new Float32Array(w * h * 4) : new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, useFloat ? gl.FLOAT : gl.UNSIGNED_BYTE, px);
        out.push(px);
      }
      return out;
    },

    release(program) {
      gl.deleteProgram(program);
    },
  };
};
`;

/** Installs the GL helper and the pure analysis core into the page. */
export async function installGl(page, vertexSource, extraScripts = []) {
  await page.addScriptTag({ content: GL_SCRIPT });
  for (const script of extraScripts) await page.addScriptTag({ content: script });
  return await page.evaluate((v) => {
    window.__shaderGl = window.__initShaderGl(v);
    return { floatTargets: window.__shaderGl.floatTargets };
  }, vertexSource);
}

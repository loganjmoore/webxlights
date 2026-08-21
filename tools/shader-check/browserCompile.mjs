// Headless-Chromium GLSL compilation, for the harness.
//
// The browser is the only honest compiler for the webXLights dialect: the app runs on WebGL2,
// so pass/fail has to come from a real WebGL2 context, not from a validator that merely aims to
// agree with one. One browser and one page are shared across every shader checked - a compile
// takes microseconds and a browser launch takes seconds.

import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

/** Where a Chromium binary actually is, since this repo never downloads one. */
function chromiumPath() {
  if (process.env.SHADER_CHECK_CHROMIUM) return process.env.SHADER_CHECK_CHROMIUM;
  // The path Claude-style CI containers and the dev containers provide.
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  return undefined; // let playwright-core find its own managed browser, if one exists
}

export async function startCompiler() {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    // Software WebGL: these machines have no GPU, and SwiftShader is deterministic anyway -
    // better for a harness than whatever driver happens to be installed.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");

  const hasWebgl2 = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    return gl !== null;
  });
  if (!hasWebgl2) {
    await browser.close();
    throw new Error("headless Chromium could not create a WebGL2 context");
  }

  return {
    /**
     * Compiles a fragment shader, optionally linking it against a vertex shader - the linking
     * is what the real app does, so the harness does it too when it has the pair.
     * Returns null on success, or the compiler/linker log.
     */
    async compile(fragmentSource, vertexSource = null) {
      return await page.evaluate(
        ([frag, vert]) => {
          const gl = document.createElement("canvas").getContext("webgl2");
          if (!gl) return "no WebGL2 context";
          const make = (type, src) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              // ANGLE's info log can carry a trailing NUL, which poisons anything that later
              // treats the message as a C string - execFile argv, JSON files opened in editors.
              const log = (gl.getShaderInfoLog(shader) ?? "unknown compile error").replace(/\u0000/g, "").trim();
              return { error: log };
            }
            return { shader };
          };
          const f = make(gl.FRAGMENT_SHADER, frag);
          if (f.error) return f.error;
          if (!vert) return null;
          const v = make(gl.VERTEX_SHADER, vert);
          if (v.error) return `vertex stage: ${v.error}`;
          const program = gl.createProgram();
          gl.attachShader(program, v.shader);
          gl.attachShader(program, f.shader);
          gl.bindAttribLocation(program, 0, "position");
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            return (gl.getProgramInfoLog(program) ?? "unknown link error").replace(/\u0000/g, "").trim();
          }
          return null;
        },
        [fragmentSource, vertexSource],
      );
    },
    async close() {
      await browser.close();
    },
  };
}

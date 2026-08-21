#!/usr/bin/env node
// Renders shaders at real prop sizes and saves a contact sheet, so "does it read at 60x1?"
// is answered by looking rather than by hoping.
//
//   node tools/shader-check/render.mjs results/haiku-4-5/*.fs --out results/haiku-4-5-sheet
//
// One PNG per shape (roofline 60x1, megatree 16x50, matrix 32x32), each a grid of shaders by
// time samples, scaled up nearest-neighbour - the same way the app's preview refuses to smooth,
// because smoothing hides exactly the aliasing that ruins a prop.
//
// Colour inputs are filled from a fixed test palette (red, blue, gold, green) in declaration
// order, wrapping - the rule both real programs apply - and every other input takes its header
// DEFAULT, so what renders is what a user would first see.

import "./tsResolve.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const { parseIsf, defaultValueFor } = await import("../../packages/formats/src/isf.ts");
const { webxlFragmentSource, VERTEX } = await import("../../apps/web/src/lib/webglShaderHost.ts");

const SHAPES = [
  { name: "roofline-60x1", width: 60, height: 1, scale: 12 },
  { name: "megatree-16x50", width: 16, height: 50, scale: 8 },
  { name: "matrix-32x32", width: 32, height: 32, scale: 10 },
];
const TIMES = [0.5, 3.0, 7.5];
const PALETTE = [
  [1, 0.15, 0.15, 1],
  [0.15, 0.45, 1, 1],
  [1, 0.8, 0.25, 1],
  [0.25, 0.85, 0.45, 1],
];

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args[outAt + 1] : "tools/shader-check/render-out";
const files = args.filter((a, i) => a !== "--out" && (outAt < 0 || i !== outAt + 1));
if (files.length === 0) {
  console.error("usage: node tools/shader-check/render.mjs file.fs [...] --out dir");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const shaders = files.map((file) => {
  const text = readFileSync(file, "utf8");
  let inputs = {};
  try {
    const parsed = parseIsf(text);
    const colorNames = parsed.inputs.filter((i) => i.type === "color").map((i) => i.name);
    for (const input of parsed.inputs) inputs[input.name] = defaultValueFor(input);
    colorNames.forEach((name, i) => (inputs[name] = PALETTE[i % PALETTE.length]));
  } catch {
    // no header: render with no inputs
  }
  return { name: basename(file, ".fs"), fragment: webxlFragmentSource(text), inputs };
});

const browser = await chromium.launch({
  executablePath: process.env.SHADER_CHECK_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 4000 } });
await page.setContent("<body style='background:#111;color:#ddd;font:12px monospace;margin:12px'></body>");

for (const shape of SHAPES) {
  await page.evaluate(
    ({ shaders, shape, TIMES, VERTEX }) => {
      document.body.innerHTML = `<h3>${shape.name} - columns are TIME ${TIMES.join("s, ")}s</h3>`;
      const gl = document.createElement("canvas").getContext("webgl2");
      const makeStage = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vertex = makeStage(gl.VERTEX_SHADER, VERTEX);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

      for (const { name, fragment, inputs } of shaders) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;align-items:center;margin:6px 0";
        const label = document.createElement("span");
        label.textContent = name.padEnd(14);
        label.style.width = "130px";
        row.appendChild(label);

        const frag = makeStage(gl.FRAGMENT_SHADER, fragment);
        if (!frag || !vertex) {
          label.textContent += " (does not compile)";
          document.body.appendChild(row);
          continue;
        }
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, frag);
        gl.bindAttribLocation(program, 0, "position");
        gl.linkProgram(program);
        gl.useProgram(program);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shape.width, shape.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, shape.width, shape.height);

        const uni = (n) => gl.getUniformLocation(program, n);
        for (const t of TIMES) {
          gl.uniform2f(uni("RENDERSIZE"), shape.width, shape.height);
          gl.uniform1f(uni("TIME"), t);
          gl.uniform1f(uni("TIMEDELTA"), 1 / 20);
          gl.uniform1i(uni("FRAMEINDEX"), Math.round(t * 20));
          gl.uniform1i(uni("NUMCOLORS"), 4);
          gl.uniform4f(uni("DATE"), 0, 0, 0, t);
          for (const [n, v] of Object.entries(inputs)) {
            const loc = uni(n);
            if (!loc) continue;
            if (typeof v === "boolean") gl.uniform1i(loc, v ? 1 : 0);
            else if (typeof v === "number") {
              // ints and floats both appear as numbers; try float, fall back to int on error
              gl.uniform1f(loc, v);
              if (gl.getError() !== gl.NO_ERROR) gl.uniform1i(loc, Math.round(v));
            } else if (Array.isArray(v)) {
              if (v.length >= 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
              else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
            }
          }
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          const pixels = new Uint8ClampedArray(shape.width * shape.height * 4);
          gl.readPixels(0, 0, shape.width, shape.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          const canvas = document.createElement("canvas");
          canvas.width = shape.width;
          canvas.height = shape.height;
          canvas.style.cssText = `width:${shape.width * shape.scale}px;height:${Math.max(shape.height * shape.scale, 8)}px;image-rendering:pixelated;border:1px solid #333`;
          const ctx = canvas.getContext("2d");
          const image = ctx.createImageData(shape.width, shape.height);
          // flip: GL rows are bottom-up, canvas top-down
          for (let y = 0; y < shape.height; y++) {
            const src = (shape.height - 1 - y) * shape.width * 4;
            image.data.set(pixels.subarray(src, src + shape.width * 4), y * shape.width * 4);
          }
          ctx.putImageData(image, 0, 0);
          row.appendChild(canvas);
        }
        gl.deleteProgram(program);
        document.body.appendChild(row);
      }
    },
    { shaders, shape, TIMES, VERTEX },
  );
  const out = join(outDir, `${shape.name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
}
await browser.close();

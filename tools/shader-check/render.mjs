#!/usr/bin/env node
// Renders shaders so a reviewer can actually judge them, rather than guess from three stills.
//
//   node tools/shader-check/render.mjs shaders/*.fs --out sheets/
//   ... --shapes roofline-60x1,matrix-32x32   a subset of the four
//   ... --palette regression                  just one palette instead of both
//   ... --frames 10                           filmstrip columns per shader
//
// Three things were wrong with the version this replaces, all found by using it:
//
//   - it screenshotted `fullPage` on a fixed 1400x4000 viewport, so a two-shader run produced an
//     image that was 90% empty background and a fifty-shader run was unusable. The page is now
//     sized to its content and PAGED - eight shaders per sheet - so each row is big enough to
//     judge.
//   - it sampled THREE time points. Three stills cannot show whether motion flows or fizzes,
//     which is most of what matters here, and they actively mislead: the round-4 `comet` reads as
//     an orbiting comet in three stills and is provably a static ring. Every shader now gets a
//     FILMSTRIP of evenly spaced frames across the 6 s loop.
//   - it rendered against ONE fixed palette. That is right for regression comparability and wrong
//     for judging beauty - it is half the reason the round-4 snow shader looked like red dots on
//     blue. Both are now rendered: the fixed regression palette (proving the shader survives an
//     arbitrary user palette) and the shader's own header DEFAULTs (showing the look its author
//     intended). A shader good only under its own defaults has not solved the palette problem;
//     one good only under the regression palette got lucky.
//
// The three prop shapes are unchanged from earlier rounds so this round's sheets stay comparable
// to the committed ones; screen-192x108 is added as the fourth.

import "./tsResolve.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { SHAPES, REGRESSION_PALETTE, FPS, launchPage, installGl } from "./harness.mjs";

const { parseIsf, defaultValueFor } = await import("../../packages/formats/src/isf.ts");
const { webxlFragmentSource, VERTEX } = await import("../../apps/web/src/lib/webglShaderHost.ts");

const PER_SHEET = 8;   // shaders per PNG - any more and a row is too small to judge
const LOOP_SECONDS = 6;

const args = process.argv.slice(2);
const take = (flag, fallback = null) => {
  const at = args.indexOf(flag);
  if (at < 0) return fallback;
  const v = args[at + 1];
  args.splice(at, 2);
  return v;
};
const outDir = take("--out", "tools/shader-check/render-out");
const shapeFilter = take("--shapes")?.split(",");
const paletteFilter = take("--palette")?.split(",");
const columns = Number(take("--frames", "10"));
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: node tools/shader-check/render.mjs file.fs [...] --out dir [--shapes a,b] [--palette regression|defaults] [--frames 10]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const shapes = SHAPES.filter((s) => !shapeFilter || shapeFilter.includes(s.name));
const palettes = [
  { name: "regression", label: "fixed regression palette (red, blue, gold, green) - survives an arbitrary user palette" },
  { name: "defaults", label: "the shader's own header DEFAULTs - the look its author intended" },
].filter((p) => !paletteFilter || paletteFilter.includes(p.name));

const shaders = files.map((file) => {
  const text = readFileSync(file, "utf8");
  const entry = { name: basename(file, ".fs"), fragment: webxlFragmentSource(text), colorCount: 0 };
  const inputs = { regression: {}, defaults: {} };
  try {
    const parsed = parseIsf(text);
    const colorNames = parsed.inputs.filter((i) => i.type === "color").map((i) => i.name);
    entry.colorCount = colorNames.length;
    for (const input of parsed.inputs) {
      inputs.regression[input.name] = defaultValueFor(input);
      inputs.defaults[input.name] = defaultValueFor(input);
    }
    colorNames.forEach((name, i) => (inputs.regression[name] = REGRESSION_PALETTE[i % REGRESSION_PALETTE.length]));
  } catch {
    // no header: render with no inputs, exactly as the app would
  }
  entry.inputs = inputs;
  return entry;
});

const times = Array.from({ length: columns }, (_, i) => (i * LOOP_SECONDS) / columns);

const { browser, page } = await launchPage({ width: 1500, height: 1000 });
await installGl(page, VERTEX);

let written = 0;
for (const shape of shapes) {
  for (const palette of palettes) {
    for (let start = 0; start < shaders.length; start += PER_SHEET) {
      const batch = shaders.slice(start, start + PER_SHEET);
      const height = await page.evaluate(
        ({ batch, shape, times, palette, loopSeconds, fps }) => {
          const gl = window.__shaderGl;
          document.body.style.cssText = "background:#0b0b0d;color:#e8e8ea;font:12px ui-monospace,monospace;margin:0;padding:16px";
          document.body.innerHTML =
            `<div style="font-size:15px;font-weight:600;margin-bottom:2px">${shape.name} &middot; ${palette.name}</div>` +
            `<div style="opacity:.55;margin-bottom:14px">${palette.label} &mdash; ${times.length} frames evenly spaced across the ${loopSeconds}s loop, left to right</div>`;

          for (const sh of batch) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:6px;align-items:center;margin:0 0 10px";
            const label = document.createElement("div");
            label.textContent = sh.name;
            label.style.cssText = "width:150px;flex:none;opacity:.9";
            row.appendChild(label);

            const built = gl.build(sh.fragment);
            if (built.error) {
              label.textContent = sh.name + "  (does not compile)";
              label.style.color = "#ff6b6b";
              document.body.appendChild(row);
              continue;
            }
            const frames = gl.frames(built.program, shape.width, shape.height, times, sh.inputs[palette.name], sh.colorCount || 4, fps);
            for (const px of frames) {
              const canvas = document.createElement("canvas");
              canvas.width = shape.width;
              canvas.height = shape.height;
              // Nearest-neighbour on purpose: smoothing hides exactly the aliasing that ruins a
              // prop, which is the thing these sheets exist to reveal.
              canvas.style.cssText =
                `width:${shape.width * shape.scale}px;height:${Math.max(shape.height * shape.scale, 10)}px;` +
                "image-rendering:pixelated;border:1px solid #26262b;flex:none";
              const ctx = canvas.getContext("2d");
              const image = ctx.createImageData(shape.width, shape.height);
              const isFloat = px instanceof Float32Array;
              for (let y = 0; y < shape.height; y++) {
                // GL rows are bottom-up, canvas rows are top-down.
                const srcRow = (shape.height - 1 - y) * shape.width * 4;
                for (let x = 0; x < shape.width * 4; x++) {
                  const v = px[srcRow + x];
                  image.data[y * shape.width * 4 + x] = isFloat ? Math.round(Math.min(1, Math.max(0, v || 0)) * 255) : v;
                }
              }
              ctx.putImageData(image, 0, 0);
              row.appendChild(canvas);
            }
            gl.release(built.program);
            document.body.appendChild(row);
          }
          // Measure the last row rather than trusting scrollHeight, which over-reports on a
          // flex layout and leaves a band of empty background - the very thing that made the
          // old sheets unusable.
          const rows = document.body.querySelectorAll("div");
          const last = rows[rows.length - 1];
          return Math.ceil((last ? last.getBoundingClientRect().bottom : document.body.scrollHeight) + 16);
        },
        { batch, shape, times, palette, loopSeconds: LOOP_SECONDS, fps: FPS },
      );

      // Size the viewport to the content instead of screenshotting a fixed 4000px page: the old
      // sheets were mostly empty background, which is what made them unusable at fifty shaders.
      const width = 150 + times.length * (shape.width * shape.scale + 8) + 60;
      await page.setViewportSize({ width: Math.min(Math.max(width, 700), 4000), height: Math.min(height, 4000) });
      const page_n = Math.floor(start / PER_SHEET) + 1;
      const pages = Math.ceil(shaders.length / PER_SHEET);
      const suffix = pages > 1 ? `-${String(page_n).padStart(2, "0")}` : "";
      const out = join(outDir, `${shape.name}-${palette.name}${suffix}.png`);
      await page.screenshot({ path: out });
      written++;
      console.log(`wrote ${out}`);
    }
  }
}
await browser.close();
console.log(`\n${written} sheet${written === 1 ? "" : "s"} in ${outDir}`);

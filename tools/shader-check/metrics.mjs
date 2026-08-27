#!/usr/bin/env node
// Makes "is this shader any good?" answerable without a human squinting at it.
//
//   node tools/shader-check/metrics.mjs shaders/*.fs [--json out.json] [--frames 120]
//
// This does NOT score beauty and cannot. It reports whether a shader is disqualified - too dark
// to read from the street, muddy, fizzing instead of flowing, aliasing on a roofline, ignoring
// the user's palette, strobing past the photosensitivity limit, or quietly dying after ten
// minutes - and it points a reviewer at the shape where the problem is. Passing every threshold
// here means "not disqualified", never "beautiful".
//
// What gets rendered, per shader:
//   - the 6 s loop (120 frames at 20 fps, this engine's frame period) at all four shapes, with
//     colour inputs filled from the fixed regression palette. This is the gate: it proves the
//     shader survives an arbitrary user palette rather than only its own defaults.
//   - a short pass at the shader's own header DEFAULTs, for `openingLuma` - a shader that opens
//     near-black looks broken on the first frame a user ever sees, and five of the previously
//     scored 26 lost a point to exactly that.
//   - the same loop with TIME starting at 600 s and 36000 s, at matrix-32x32, to catch precision
//     blow-up and slow drift. A show runs all night; nothing else in the toolchain would notice.

import "./tsResolve.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHAPES, REGRESSION_PALETTE, FPS, launchPage, installGl } from "./harness.mjs";
import { rgbToHsl, featureVector, closestPairs } from "./metricsCore.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { parseIsf, defaultValueFor } = await import("../../packages/formats/src/isf.ts");
const { webxlFragmentSource, VERTEX } = await import("../../apps/web/src/lib/webglShaderHost.ts");

export const THRESHOLDS = JSON.parse(readFileSync(join(here, "thresholds.json"), "utf8"));

/** The hues the regression palette actually contains, for paletteFidelity. */
const PALETTE_HUES = REGRESSION_PALETTE.map(([r, g, b]) => rgbToHsl(r, g, b).h);

// Drift is compared against a baseline sampled EXACTLY the same way, over a long, sparsely
// sampled span. The first version compared a dense 6 s window at TIME 0 against a dense 2 s
// window at TIME 600 and hard-failed five shaders a person scored 4 or 5 - all of them slow
// cycles (breathe, snow, sparkle, aurora, alternate). It was measuring which part of the cycle
// each window happened to land on, not drift. Sampling every 0.51 s over ~24 s averages across a
// typical cycle, and the odd interval keeps the samples from locking to a round-number period.
const DRIFT_EPOCHS = [0, 600, 36000];
const DRIFT_FRAMES = 48;
const DRIFT_STEP = 0.51;
const DEFAULTS_FRAMES = 24;
const DRIFT_SHAPE = "matrix-32x32";

function inputsFor(text, palette) {
  try {
    const parsed = parseIsf(text);
    const inputs = {};
    for (const input of parsed.inputs) inputs[input.name] = defaultValueFor(input);
    if (palette) {
      const colors = parsed.inputs.filter((i) => i.type === "color").map((i) => i.name);
      colors.forEach((name, i) => (inputs[name] = palette[i % palette.length]));
    }
    return { inputs, colorCount: parsed.inputs.filter((i) => i.type === "color").length };
  } catch {
    return { inputs: {}, colorCount: 0 };
  }
}

/**
 * A metric a shader is allowed to fail because its brief asks for exactly that. A warm-white
 * sparkle really is low-chroma; a shader told to be red and gold really should ignore a blue in
 * the regression palette. Waivers are per-shader flags set from library.json, never blanket
 * relaxations of the threshold.
 */
const WAIVERS = {
  chroma: (s) => s.monochromeByDesign,
  paletteFidelity: (s) => s.namesOwnColours,
};

/**
 * Every gate this metric set violates, as human sentences.
 *
 * Driven from thresholds.json rather than hand-written per metric, so that demoting something to
 * `"role": "diagnostic"` in that file actually stops it gating. The previous hand-written version
 * could disagree with the file it was supposedly enforcing, which is the one thing a gate must
 * never do.
 */
export function violations(shader, thresholds = THRESHOLDS) {
  const out = [];
  const push = (severity, text) => out.push({ severity, text });
  const pct = (v) => `${(v * 100).toFixed(0)}%`;

  for (const [shapeName, m] of Object.entries(shader.shapes)) {
    if (m.error) { push("hard", `${shapeName}: did not render (${m.error})`); continue; }
    // A roofline is a different canvas and was scored separately, so it has its own fitted gates
    // layered over the 2D set. Anything it does not override falls through to the 2D value.
    const applicable = { ...thresholds.perShape, ...(thresholds.byShape?.[shapeName] ?? {}) };
    for (const [key, spec] of Object.entries(applicable)) {
      if (spec.role === "diagnostic") continue;
      if (WAIVERS[key]?.(shader)) continue;
      const v = m[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue; // null: not applicable at this shape
      const severity = spec.severity ?? "soft";
      if (spec.min !== undefined && v < spec.min) {
        push(severity, `${shapeName}: ${key} ${v.toPrecision(3)} below ${spec.min}${spec.short ? ` - ${spec.short}` : ""}`);
      }
      if (spec.max !== undefined && v > spec.max) {
        push(severity, `${shapeName}: ${key} ${v.toPrecision(3)} over ${spec.max}${spec.short ? ` - ${spec.short}` : ""}`);
      }
    }
  }

  const lib = thresholds.library;
  if (shader.openingLuma !== null && shader.openingLuma < lib.openingLuma.min) {
    push(lib.openingLuma.severity ?? "soft", `opens dark: openingLuma ${shader.openingLuma.toFixed(3)} below ${lib.openingLuma.min} at header DEFAULTs`);
  }
  if (shader.driftDelta !== null && shader.driftDelta > lib.driftDelta.max) {
    push(lib.driftDelta.severity ?? "hard", `driftDelta ${pct(shader.driftDelta)} over ${pct(lib.driftDelta.max)} - does not survive a long show`);
  }
  return out;
}

/**
 * Per-shader waiver flags, read from library.json by id.
 *
 * Without this the flags in library.json would be documentation rather than behaviour:
 * warm-white-sparkle would fail the chroma gate for being warm white, which is what it was asked
 * to be, and every seasonal shader that names its own colours would fail paletteFidelity for
 * obeying its description.
 */
function libraryFlags() {
  try {
    const lib = JSON.parse(readFileSync(join(here, "library.json"), "utf8"));
    return Object.fromEntries(lib.descriptions.map((d) => [d.id, d]));
  } catch {
    return {};
  }
}

export async function measureFiles(files, { frames = 120, quiet = false } = {}) {
  const flags = libraryFlags();
  const core = readFileSync(join(here, "metricsCore.mjs"), "utf8").replace(/^export /gm, "");
  const { browser, page } = await launchPage({ width: 400, height: 300 });
  const { floatTargets } = await installGl(page, VERTEX, [core]);
  if (!quiet && !floatTargets) {
    console.warn("warning: no float render targets - nanFraction cannot be measured and is reported as null");
  }

  const results = [];
  try {
    for (const file of files) {
      const id = basename(file, ".fs");
      const text = readFileSync(file, "utf8");
      const fragment = webxlFragmentSource(text);
      const regression = inputsFor(text, REGRESSION_PALETTE);
      const defaults = inputsFor(text, null);

      const measured = await page.evaluate(
        (job) => {
          const gl = window.__shaderGl;
          const built = gl.build(job.fragment);
          if (built.error) return { error: built.error };
          const program = built.program;
          const isFloat = gl.floatTargets;
          const times = (start, n) => Array.from({ length: n }, (_, i) => start + i / job.fps);

          const shapes = {};
          let spatial = null;
          for (const shape of job.shapes) {
            const frames = gl.frames(program, shape.width, shape.height, times(0, job.frames), job.regression, job.colorCount || 4, job.fps);
            shapes[shape.name] = analyze(frames, shape.width, shape.height, {
              isFloat, fps: job.fps, palette: job.paletteHues,
            });
            if (shape.name === job.driftShape) {
              spatial = spatialFrequency(frames[0], shape.width, shape.height, isFloat);
            }
          }

          // Header DEFAULTs: what the very first frame a user sees actually looks like.
          const first = job.shapes.find((s) => s.name === job.driftShape) ?? job.shapes[0];
          const defFrames = gl.frames(program, first.width, first.height, times(0, job.defaultsFrames), job.defaults, job.colorCount || 4, job.fps);
          const defaultsMetrics = analyze(defFrames, first.width, first.height, { isFloat, fps: job.fps });
          const openingLuma = analyze([defFrames[0]], first.width, first.height, { isFloat, fps: job.fps }).meanBrightness;

          // Endurance: the same measurements now, ten minutes in, and ten hours in.
          const drift = [];
          for (const start of job.driftEpochs) {
            const stamps = Array.from({ length: job.driftFrames }, (_, i) => start + i * job.driftStep);
            const f = gl.frames(program, first.width, first.height, stamps, job.regression, job.colorCount || 4, job.fps);
            drift.push(analyze(f, first.width, first.height, { isFloat, fps: job.fps, palette: job.paletteHues }));
          }

          gl.release(program);
          return { shapes, spatial, defaultsMetrics, openingLuma, drift, isFloat };
        },
        {
          fragment,
          shapes: SHAPES.map(({ name, width, height }) => ({ name, width, height })),
          regression: regression.inputs,
          defaults: defaults.inputs,
          colorCount: regression.colorCount,
          paletteHues: PALETTE_HUES,
          frames,
          fps: FPS,
          driftEpochs: DRIFT_EPOCHS,
          driftFrames: DRIFT_FRAMES,
          driftStep: DRIFT_STEP,
          defaultsFrames: DEFAULTS_FRAMES,
          driftShape: DRIFT_SHAPE,
        },
      );

      if (measured.error) {
        results.push({ id, file, error: measured.error, shapes: {}, driftDelta: null, openingLuma: null });
        if (!quiet) console.log(`${id}: DOES NOT COMPILE - ${measured.error.split("\n")[0]}`);
        continue;
      }

      // driftDelta is the worst relative change in any headline number between the 6 s window
      // and the two later ones. Relative, with a floor, so a metric that is near zero in both
      // windows does not report an infinite change.
      const [base, ...later_] = measured.drift;
      const headline = ["meanBrightness", "contrast", "chroma", "slowMotionEnergy"];
      let driftDelta = 0;
      for (const later of later_) {
        for (const k of headline) {
          const a = base[k], b = later[k];
          const scale = Math.max(Math.abs(a), Math.abs(b), 0.05);
          driftDelta = Math.max(driftDelta, Math.abs(a - b) / scale);
        }
      }

      const meta = flags[id] ?? {};
      const shader = {
        id,
        file,
        family: meta.family,
        monochromeByDesign: !!meta.monochromeByDesign,
        namesOwnColours: !!meta.namesOwnColours,
        shapes: measured.shapes,
        openingLuma: measured.openingLuma,
        defaultsMeanLuma: measured.defaultsMetrics.meanLuma,
        driftDelta,
        // The epoch-by-epoch numbers, so a drift flag can be inspected rather than trusted.
        driftEpochs: DRIFT_EPOCHS.map((start, i) => ({
          start,
          meanBrightness: measured.drift[i].meanBrightness,
          contrast: measured.drift[i].contrast,
          chroma: measured.drift[i].chroma,
          slowMotionEnergy: measured.drift[i].slowMotionEnergy,
        })),
        floatTargets: measured.isFloat,
        vector: featureVector(measured.shapes[DRIFT_SHAPE], measured.spatial),
      };
      shader.violations = violations(shader);
      shader.hardFails = shader.violations.filter((v) => v.severity === "hard").length;
      shader.softFails = shader.violations.filter((v) => v.severity === "soft").length;
      results.push(shader);

      if (!quiet) {
        const m = measured.shapes[DRIFT_SHAPE];
        console.log(
          `${id.padEnd(20)} bright ${m.meanBrightness.toFixed(2)} peak ${m.peakBrightness.toFixed(2)} contr ${m.contrast.toFixed(2)} chroma ${m.chroma.toFixed(2)} ` +
          `mud ${m.mudFraction.toFixed(2)} motion ${m.motionEnergy.toFixed(3)} flow ${m.flowCoherence.toFixed(2)} ` +
          `| ${shader.hardFails ? `${shader.hardFails} HARD ` : ""}${shader.softFails} soft`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  const withVectors = results.filter((r) => !r.error && r.vector);
  const pairs = withVectors.length > 1 ? closestPairs(withVectors) : [];
  return { shaders: results, closestPairs: pairs.slice(0, 20) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const at = args.indexOf(flag);
    if (at < 0) return null;
    const v = args[at + 1];
    args.splice(at, 2);
    return v;
  };
  const jsonOut = take("--json");
  const frames = Number(take("--frames") ?? 120);
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node tools/shader-check/metrics.mjs file.fs [...] [--json out.json] [--frames 120]");
    process.exit(2);
  }

  const report = await measureFiles(files, { frames });
  const bad = report.shaders.filter((s) => s.error || s.hardFails > 0);
  const soft = report.shaders.filter((s) => !s.error && !s.hardFails && s.softFails > 0);

  console.log(`\n${report.shaders.length - bad.length - soft.length}/${report.shaders.length} clear every threshold`);
  for (const s of report.shaders) {
    if (!s.violations?.length && !s.error) continue;
    console.log(`\n${s.id}:`);
    if (s.error) { console.log(`  does not compile: ${s.error.split("\n")[0]}`); continue; }
    for (const v of s.violations) console.log(`  ${v.severity === "hard" ? "HARD" : "soft"}: ${v.text}`);
  }
  if (report.closestPairs.length) {
    console.log("\nclosest pairs (a library of near-duplicates is not a library):");
    for (const p of report.closestPairs.slice(0, 8)) {
      console.log(`  ${p.distance.toFixed(4)}  ${p.a} <-> ${p.b}`);
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
  process.exit(bad.length ? 1 : 0);
}

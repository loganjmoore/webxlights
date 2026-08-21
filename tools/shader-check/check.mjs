#!/usr/bin/env node
// Does this ISF shader compile in BOTH programs that will be asked to run it?
//
//   node tools/shader-check/check.mjs file.fs [more.fs ...] [--json results.json]
//
// Two dialects, because the same file is compiled twice in the wild:
//
//   webxlights  GLSL ES 3.00 in a browser, using the app's real preamble and compat defines
//               (imported from apps/web/src/lib/webglShaderHost.ts, not copied), compiled and
//               linked in headless Chromium exactly as the app would.
//   xlights     desktop #version 330, using the translation real xLights applies
//               (tools/shader-check/xlightsDialect.mjs, transcribed from ShaderEffect.cpp).
//               Compiled with glslangValidator when it is installed - a real desktop-GLSL
//               front end, the strong evidence - and otherwise approximated by compiling the
//               translated source as ES 3.00 in the same browser, which catches undeclared
//               identifiers and syntax errors but NOT desktop/ES differences. The output says
//               which one ran, because they are not equally strong evidence.
//
// A shader passing here has NOT been run in real xLights - no container can do that. It has
// been compiled against xLights' own contract, read from its source. The last step is a human
// with an xLights install: docs/SHADER-XLIGHTS-CHECK.md.

import "./tsResolve.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { xlightsFragmentSource } from "./xlightsDialect.mjs";
import { startCompiler } from "./browserCompile.mjs";

// Dynamic imports, so the resolver hook in tsResolve.mjs is registered before Node walks into
// the TypeScript module graph (a static import would be resolved before any code runs).
const { parseIsf, isfPortabilityIssues } = await import("../../packages/formats/src/isf.ts");
const { webxlFragmentSource, VERTEX } = await import("../../apps/web/src/lib/webglShaderHost.ts");

function hasGlslang() {
  const probe = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

/** Raw INPUTS from the header JSON - xLights reads these raw, so the translation does too. */
function rawInputs(text) {
  const start = text.indexOf("/*");
  if (start < 0) return [];
  try {
    const braceAt = start + 2 + (text.slice(start + 2).match(/^\s*/)?.[0].length ?? 0);
    let depth = 0, inString = false, escaped = false;
    for (let i = braceAt; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const header = JSON.parse(text.slice(braceAt, i + 1));
          return Array.isArray(header.INPUTS) ? header.INPUTS : [];
        }
      }
    }
  } catch {
    return [];
  }
  return [];
}

function glslangCompile(source, scratch, name) {
  const file = join(scratch, `${name}.frag`);
  writeFileSync(file, source);
  const run = spawnSync("glslangValidator", [file], { encoding: "utf8" });
  if (run.status === 0) return null;
  // glslang prints the file name and then ERROR: lines; keep only what a person needs.
  const lines = (run.stdout + run.stderr).split("\n").filter((l) => l.startsWith("ERROR:"));
  return lines.slice(0, 8).join("\n") || (run.stdout + run.stderr).trim();
}

export async function checkFiles(files) {
  const glslang = hasGlslang();
  const xlightsMethod = glslang
    ? "glslang-desktop-330"
    : "webgl2-es-approximation (glslangValidator not installed - weaker evidence: desktop/ES differences are NOT checked)";
  const scratch = mkdtempSync(join(tmpdir(), "shader-check-"));
  const compiler = await startCompiler();
  const results = [];

  try {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const row = { file: basename(file), xlightsMethod };

      try {
        parseIsf(text);
        row.parse = { ok: true };
      } catch (err) {
        row.parse = { ok: false, error: err.message };
        // Unparseable as ISF means neither program can use it; report and move on.
        results.push({ ...row, webxlights: { ok: false, error: "not checked: ISF parse failed" }, xlights: { ok: false, error: "not checked: ISF parse failed" }, portability: [] });
        continue;
      }

      row.portability = isfPortabilityIssues(text);

      const webxlError = await compiler.compile(webxlFragmentSource(text), VERTEX);
      row.webxlights = webxlError === null ? { ok: true } : { ok: false, error: webxlError };

      const xlightsSource = xlightsFragmentSource(text, rawInputs(text));
      let xlightsError;
      if (glslang) {
        xlightsError = glslangCompile(xlightsSource, scratch, basename(file).replace(/\W+/g, "_"));
      } else {
        const es = xlightsSource.replace(/^#version 330\n/, "#version 300 es\nprecision highp float;\n");
        xlightsError = await compiler.compile(es);
      }
      row.xlights = xlightsError === null ? { ok: true } : { ok: false, error: xlightsError };

      results.push(row);
    }
  } finally {
    await compiler.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  return results;
}

function report(results) {
  const mark = (r) => (r.ok ? "pass" : "FAIL");
  for (const r of results) {
    const port = r.portability?.length ? ` portability:${r.portability.length}` : "";
    console.log(`${r.file}: webxlights=${mark(r.webxlights)} xlights=${mark(r.xlights)}${port}`);
    if (!r.parse.ok) console.log(`  parse: ${r.parse.error}`);
    if (!r.webxlights.ok && r.parse.ok) console.log(`  webxlights: ${r.webxlights.error.split("\n")[0]}`);
    if (!r.xlights.ok && r.parse.ok) console.log(`  xlights: ${r.xlights.error.split("\n")[0]}`);
    for (const issue of r.portability ?? []) console.log(`  portability: ${issue}`);
  }
  const both = results.filter((r) => r.webxlights.ok && r.xlights.ok && !(r.portability ?? []).length).length;
  console.log(`\n${both}/${results.length} compile in both dialects with no portability issues`);
  console.log(`xlights dialect checked via: ${results[0]?.xlightsMethod ?? "n/a"}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const jsonAt = args.indexOf("--json");
  const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
  const files = args.filter((a, i) => a !== "--json" && (jsonAt < 0 || i !== jsonAt + 1));
  if (files.length === 0) {
    console.error("usage: node tools/shader-check/check.mjs file.fs [more.fs ...] [--json out.json]");
    process.exit(2);
  }
  const results = await checkFiles(files);
  report(results);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2) + "\n");
  const allOk = results.every((r) => r.webxlights.ok && r.xlights.ok && !(r.portability ?? []).length);
  process.exit(allOk ? 0 : 1);
}

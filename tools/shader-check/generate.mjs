#!/usr/bin/env node
// Runs the corpus through a model and measures what actually happened.
//
//   node tools/shader-check/generate.mjs --backend claude-cli --model claude-haiku-4-5 --label haiku-4-5
//   node tools/shader-check/generate.mjs --backend openai --base-url https://api.deepseek.com/v1 \
//        --model deepseek-v4-flash --key-env DEEPSEEK_API_KEY --label deepseek
//   ... --abuse            also runs the "gate" cases from abuse.json
//   ... --only snow,fire   a subset, while iterating on the prompt
//
// For every corpus description: generate, compile in BOTH dialects (tools/shader-check/check.mjs),
// and when the first draft fails, run exactly one repair round with the compiler's error - the
// same loop the app runs (ShadersPage.generate). Everything is written to results/<label>.json:
// per-item pass/fail and errors, and the two numbers that decide the bake-off - first-draft
// compile rate and post-repair compile rate - plus MEASURED token usage from the provider's own
// usage block, never estimated.
//
// Backends:
//   claude-cli  the local `claude` binary in print mode, tools disabled, thinking off, the
//               shader SYSTEM prompt replacing the CLI's. usage comes from the API's own
//               accounting. The CLI adds ~200 tokens of its own framing to the input - real
//               tokens it really sent, but tokens the app's driver would not send; small and
//               noted in the results file.
//   openai      any /chat/completions endpoint (DeepSeek, Gemini's compat endpoint, Groq, xAI,
//               Ollama...) - the same wire format the app's OpenAiCompatibleDriver speaks.
//               Needs a key in the env var named by --key-env (or none for a local runtime).
//
// The system prompt is read out of ShaderGenerator.php, not copied here, so what this measures
// is always the prompt the server actually uses.

import "./tsResolve.mjs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFiles } from "./check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

/** The SYSTEM prompt, read from the one place it lives. */
function systemPrompt() {
  const php = readFileSync(join(here, "../../apps/api/app/Services/ShaderGenerator.php"), "utf8");
  const match = php.match(/<<<'PROMPT'\n([\s\S]*?)\n\s*PROMPT;/);
  if (!match) throw new Error("could not find the SYSTEM heredoc in ShaderGenerator.php");
  // The heredoc body is indented to the class; PHP strips the closing marker's indentation
  // from every line, so do the same.
  return match[1].replace(/^ {4}/gm, "");
}

/** What ShaderGenerator sends as the user message, first draft and repair alike. */
function userMessage(description, previousSource, compileError) {
  if (previousSource && compileError) {
    return [
      "This shader failed to compile. Fix it and return the corrected ISF file.",
      "",
      "The compiler said:",
      compileError,
      "",
      "The shader was:",
      previousSource,
      "",
      `It was meant to be: ${description}`,
    ].join("\n");
  }
  return `Write an ISF shader for a Christmas light display:\n\n${description}`;
}

/** ShaderGenerator::unfence, for models that wrap the file in ``` anyway. */
function unfence(text) {
  let t = text.trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split(/\r?\n/);
  lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop();
  return lines.join("\n");
}

function claudeCliBackend(model) {
  return async (system, user) => {
    const started = Date.now();
    const { stdout } = await run(
      "claude",
      ["-p", user, "--model", model, "--system-prompt", system, "--output-format", "json", "--max-turns", "1", "--disallowedTools", "*"],
      // MAX_THINKING_TOKENS=0 because the app's driver does not enable thinking for the cheap
      // tier - measuring with thinking on would bill for tokens the server never buys.
      { env: { ...process.env, MAX_THINKING_TOKENS: "0" }, maxBuffer: 16 * 1024 * 1024, timeout: 300_000 },
    );
    const reply = JSON.parse(stdout);
    if (reply.is_error) throw new Error(`claude CLI: ${reply.result}`);
    return {
      text: reply.result,
      usage: {
        input_tokens: (reply.usage?.input_tokens ?? 0) + (reply.usage?.cache_creation_input_tokens ?? 0) + (reply.usage?.cache_read_input_tokens ?? 0),
        output_tokens: reply.usage?.output_tokens ?? null,
      },
      ms: Date.now() - started,
    };
  };
}

function openAiBackend(baseUrl, model, keyEnv) {
  const key = keyEnv ? process.env[keyEnv] : null;
  if (keyEnv && !key) throw new Error(`--key-env ${keyEnv} is not set`);
  return async (system, user) => {
    const started = Date.now();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? `HTTP ${response.status}`);
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") throw new Error("empty response");
    return {
      text,
      usage: {
        input_tokens: body?.usage?.prompt_tokens ?? null,
        output_tokens: body?.usage?.completion_tokens ?? null,
      },
      ms: Date.now() - started,
    };
  };
}

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

const backendName = arg("backend", "claude-cli");
const model = arg("model", "claude-haiku-4-5");
const label = arg("label", model.replace(/[^\w.-]+/g, "-"));
const only = arg("only")?.split(",");
const withAbuse = process.argv.includes("--abuse");

const backend =
  backendName === "claude-cli"
    ? claudeCliBackend(model)
    : openAiBackend(arg("base-url") ?? "http://localhost:11434/v1", model, arg("key-env"));

const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const descriptions = corpus.descriptions.filter((d) => !only || only.includes(d.id));
const system = systemPrompt();

const outDir = join(here, "results");
const shaderDir = join(outDir, label);
mkdirSync(shaderDir, { recursive: true });

const items = [];
console.log(`generating ${descriptions.length} shaders with ${backendName}/${model}...`);

for (const { id, text } of descriptions) {
  const item = { id, description: text, calls: [] };
  items.push(item);
  try {
    const first = await backend(system, userMessage(text));
    item.calls.push({ round: "draft", usage: first.usage, ms: first.ms });
    item.source = unfence(first.text);
    writeFileSync(join(shaderDir, `${id}.fs`), item.source + "\n");
    console.log(`  ${id}: got ${item.source.length} chars in ${first.ms}ms`);
  } catch (err) {
    item.error = String(err.message ?? err);
    console.log(`  ${id}: ERROR ${item.error}`);
  }
}

// First-draft compile, both dialects, one browser launch for the lot.
console.log("compiling first drafts in both dialects...");
const firstChecks = await checkFiles(items.filter((i) => i.source).map((i) => join(shaderDir, `${i.id}.fs`)));
for (const item of items) {
  const check = firstChecks.find((c) => c.file === `${item.id}.fs`);
  if (!check) continue;
  item.firstDraft = check;
  item.firstDraftOk = check.webxlights.ok && check.xlights.ok && check.portability.length === 0;
}

// One repair round for the failures - the same single retry the app gives, with the same
// error text a browser would have sent back (webXLights' first, else xLights', else the lint).
const needRepair = items.filter((i) => i.source && !i.firstDraftOk);
console.log(`repairing ${needRepair.length} failures...`);
for (const item of needRepair) {
  const check = item.firstDraft;
  const error = !check.webxlights.ok
    ? check.webxlights.error
    : !check.xlights.ok
      ? `xLights (desktop GLSL): ${check.xlights.error}`
      : `This shader would not work in xLights: ${check.portability.join("; ")}`;
  try {
    const repair = await backend(system, userMessage(item.description, item.source, error));
    item.calls.push({ round: "repair", usage: repair.usage, ms: repair.ms });
    item.repairedSource = unfence(repair.text);
    writeFileSync(join(shaderDir, `${item.id}.fs`), item.repairedSource + "\n");
  } catch (err) {
    item.repairError = String(err.message ?? err);
  }
}

if (needRepair.some((i) => i.repairedSource)) {
  const repairChecks = await checkFiles(needRepair.filter((i) => i.repairedSource).map((i) => join(shaderDir, `${i.id}.fs`)));
  for (const item of needRepair) {
    const check = repairChecks.find((c) => c.file === `${item.id}.fs`);
    if (!check) continue;
    item.afterRepair = check;
  }
}
for (const item of items) {
  item.ok = item.firstDraftOk || (item.afterRepair ? item.afterRepair.webxlights.ok && item.afterRepair.xlights.ok && item.afterRepair.portability.length === 0 : false);
}

// The abuse "gate" cases: the screen lets these through, so what matters is whether the reply
// survives the ISF gate. Either outcome is safe - a refusal in prose fails the gate and is
// discarded; a shader is a shader - but the results file records which happened.
let abuse = null;
if (withAbuse) {
  const cases = JSON.parse(readFileSync(join(here, "abuse.json"), "utf8")).cases.filter((c) => c.expect === "gate");
  abuse = [];
  console.log(`running ${cases.length} abuse gate cases...`);
  for (const { id, text } of cases) {
    try {
      const reply = await backend(system, userMessage(text));
      const source = unfence(reply.text);
      const file = join(shaderDir, `abuse-${id}.fs`);
      writeFileSync(file, source + "\n");
      const [check] = await checkFiles([file]);
      abuse.push({
        id,
        usage: reply.usage,
        passedIsfGate: check.webxlights.ok && check.xlights.ok && check.portability.length === 0,
        looksLikeProse: !source.trimStart().startsWith("/*"),
      });
    } catch (err) {
      abuse.push({ id, error: String(err.message ?? err) });
    }
  }
}

const generated = items.filter((i) => i.source);
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const allCalls = items.flatMap((i) => i.calls);
const summary = {
  label,
  backend: backendName,
  model,
  ranAt: new Date().toISOString(),
  // Which prompt these numbers belong to - a run is only comparable to another run of the
  // same prompt, and "the prompt at the time" is not something to remember.
  systemPromptSha256: createHash("sha256").update(system).digest("hex").slice(0, 16),
  corpusSize: descriptions.length,
  generated: generated.length,
  firstDraftBothDialects: items.filter((i) => i.firstDraftOk).length,
  afterOneRepairBothDialects: items.filter((i) => i.ok).length,
  repairRounds: needRepair.length,
  tokens: {
    // Straight from the provider's usage accounting, summed over every call including repairs.
    input: sum(allCalls.map((c) => c.usage?.input_tokens)),
    output: sum(allCalls.map((c) => c.usage?.output_tokens)),
    calls: allCalls.length,
  },
  meanLatencyMs: allCalls.length ? Math.round(sum(allCalls.map((c) => c.ms)) / allCalls.length) : null,
  note:
    backendName === "claude-cli"
      ? "usage measured through the claude CLI: tools disabled, thinking off, shader SYSTEM prompt only; the CLI adds roughly 200 tokens of its own framing per call to input_tokens that the app's driver would not send"
      : "usage measured from the provider's /chat/completions usage block",
};

const out = { summary, items, abuse };
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log(`full results: tools/shader-check/results/${label}.json`);

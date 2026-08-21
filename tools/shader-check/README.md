# shader-check: does it compile in *both* programs?

An ISF shader made here is only worth keeping if it also works in real xLights - that is the
point of using xLights' own format. This directory holds the tooling that makes that claim
testable instead of hopeful.

## The pieces

| File | What it is |
| --- | --- |
| `check.mjs` | compiles ISF files as both dialects and reports per-file pass/fail |
| `xlightsDialect.mjs` | the exact translation xLights applies, transcribed from `ShaderEffect.cpp` (commit `858a5aea73f`) |
| `browserCompile.mjs` | headless-Chromium WebGL2 compiles, using the app's real preamble via `webglShaderHost.ts` |
| `generate.mjs` | runs the corpus through a model, compiles everything, writes measured results |
| `corpus.json` | 26 descriptions people actually ask for, plus the three prop shapes that break things |
| `abuse.json` | injection and off-topic cases, with the layer expected to stop each |
| `results/` | one JSON per bake-off run - committed, so runs are compared rather than remembered |
| `samples/` | generated shaders that pass the harness, for the human xLights check (`docs/SHADER-XLIGHTS-CHECK.md`) |

## Checking a shader

```
node tools/shader-check/check.mjs path/to/shader.fs [more...] [--json out.json]
```

Each file is compiled twice:

- **webXLights dialect** - GLSL ES 3.00 with the app's actual preamble, compat defines and
  input-uniform declarations, compiled and linked in headless Chromium. This is exactly what
  the app does, because the code is imported from the app.
- **xLights dialect** - desktop `#version 330` with xLights' actual prepend and rewrites.
  Compiled with `glslangValidator` when installed (a real desktop-GLSL front end - install it
  with `apt install glslang-tools`); otherwise approximated in the browser as ES 3.00, and the
  output says so, because the approximation cannot see desktop/ES differences.

It also runs `isfPortabilityIssues()` - the same lint the app's draft gate uses - which flags
things that compile in one program and mean something else in the other.

Passing here is **not** "verified in xLights". It is "compiled against xLights' contract as
read from its source". The last step needs a human: `docs/SHADER-XLIGHTS-CHECK.md`.

## Running the corpus against a model

```
node tools/shader-check/generate.mjs --backend claude-cli --model claude-haiku-4-5 --label haiku-4-5 --abuse
node tools/shader-check/generate.mjs --backend openai --base-url https://api.deepseek.com/v1 \
     --model deepseek-v4-flash --key-env DEEPSEEK_API_KEY --label deepseek-v4-flash
```

For each corpus description: one draft, compile in both dialects, and one repair round with the
compiler's own error when the draft fails - the exact loop the app runs. The results file
records the two numbers the model choice hangs on (first-draft compile rate and post-repair
compile rate), every call's **measured** token usage from the provider's own accounting, and
per-item errors. The system prompt is read out of `ShaderGenerator.php` at run time, so the
prompt being measured is always the prompt being shipped.

`--only snow,fire` runs a subset while iterating on the prompt. `--abuse` also runs the
gate-expected abuse cases and records whether each reply survived the ISF gate.

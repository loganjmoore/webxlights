# Bake-off results

Every run in this directory was produced by `generate.mjs` against the corpus in
`corpus.json`: one draft per description, compiled in **both** dialects by `check.mjs`
(webXLights' real GLSL ES 3.00 preamble in headless Chromium; xLights' translated desktop
`#version 330` through glslangValidator), with exactly one repair round on failure - the same
loop the app runs. Token counts are the provider's own `usage` accounting, never estimates.

All runs were made on 2026-08-21. `systemPromptSha256` in each file says which prompt the run
measured (earliest files predate the field). The shipped prompt is `fd63b6c73cbbd318`.

## The prompt-development loop, round by round

| Round | Prompt change | Haiku 4.5 first-draft | Sonnet 5 first-draft |
| --- | --- | --- | --- |
| 1 | rewritten for the portable subset | **26/26** | 25/26 (used reserved word `active`) |
| 2 | + drive vertical motion along x when RENDERSIZE.y < 2 | 26/26 | **16/26** - regression: models named the flag `flat`, a GLSL reserved word |
| 3 | + never use GLSL reserved words as names | 25/26 (read colours it never declared) | 26/26 |
| 4 (shipped) | + every colour name read must be a declared INPUT | **26/26, 0 repairs** | 25/26, 26/26 after one repair |

Round 2 is the reason the corpus is committed: a quality-only prompt line caused a 10-shader
compile regression in a model that wasn't even the one being tuned, and it was caught the same
hour because the whole corpus re-runs in minutes.

## Final measured numbers (round 4, shipped prompt)

| | Haiku 4.5 | Sonnet 5 (no thinking) |
| --- | --- | --- |
| first-draft compile, both dialects | **26/26 (100%)** | 25/26 (96%) |
| after one repair | 26/26 | 26/26 |
| repair rounds | 0 | 1 |
| measured input tokens, whole corpus | 39,534 | 58,717 |
| measured output tokens, whole corpus | 14,626 | 23,982 |
| per working shader | ~1,520 in / ~560 out | ~2,260 in / ~920 out |
| mean latency per call | 12.7 s | 15.1 s |

Measurement method: the `claude` CLI in print mode, all tools disabled, thinking off
(matching the app's driver, which does not buy thinking for these models), the shader SYSTEM
prompt replacing the CLI's. The CLI adds roughly 200 tokens of its own framing per call to the
input; that is included in the numbers above, so the app's real input cost is slightly lower.

**What could not be measured here:** gemini-2.5/3.5-flash-lite, deepseek-v4-flash,
grok-build-0.1, a Groq-hosted open model and a local Ollama model. This environment has no API
keys for any of them and no local model runtime. The runner supports them
(`--backend openai --base-url ... --key-env ...`); anyone with keys can produce the same
results file for those rows. Until then their costs in `docs/SHADER-ASSISTANT-COST.md` are
price-sheet arithmetic at Haiku's measured token profile, clearly marked - their *compile
rates* are unknown, and compile rate is what decides cost per working shader.

## Abuse gate cases

The four `expect: "gate"` cases from `abuse.json` (`what is 2+2`, an essay, a translation, a
recipe) were run each round with `--abuse`. In every round, both models returned a compiling
ISF shader - an animated interpretation, as the prompt instructs - and never prose. The
`expect: "screen"` cases never reach a model at all; `ShaderScopeTest` pins them server-side
with no credit spent.

## Subjective quality, Haiku 4.5 round 4, scored by eye

Scored from `render.mjs` contact sheets at three shapes (fixed red/blue/gold/green palette,
header defaults, TIME 0.5/3/7.5 s). 1 = wrong or invisible, 3 = recognisable, 5 = would ship.

| id | 32×32 | 60×1 | note |
| --- | --- | --- | --- |
| alternate | 5 | 5 | exactly the ask, clean swaps |
| aurora | 4 | 4 | soft drifting curtains |
| barber | 5 | 4 | bold diagonals |
| breathe | 4 | 4 | smooth glow cycle |
| candle | 4 | 3 | warm flicker; reads as bands on the line |
| candy-cane | 5 | 5 | crisp moving stripes |
| chase | 4 | 4 | clear moving band |
| checker | 5 | 5 | crisp, slides as asked |
| colour-wash | 4 | 4 | clean whole-canvas fade |
| comet | 4 | 3 | ring orbit at 32²; bright dot with tail on the line |
| fire | 2 | 3 | too dark at defaults on 32²; roofline branch works |
| fireworks | 2 | 2 | bursts too dim at night-viewing contrast |
| flag | 5 | 4 | genuinely reads as a waving US flag |
| fog | 2 | 2 | drifting but dim - arguably faithful to fog |
| lava-lamp | 2 | 3 | blobs too dark at defaults |
| matrix-rain | 4 | 3 | falling streaks; x-fallback visible on the line |
| plasma | 5 | 4 | proper swirl |
| pulse | 2 | 3 | beats, but from near-black - low contrast at 32² |
| rainbow | 5 | 5 | full saturated sweep |
| ripples | 5 | 3 | concentric rings; sparse on the line |
| snow | 4 | 4 | drifting flakes, readable dashes on the line |
| sparkle | 4 | 4 | dense twinkle over base colour |
| sunrise | 4 | 3 | rising warm band |
| tunnel | 5 | 3 | strong spiral at 32² |
| twinkle | 3 | 4 | works, a little uniform |
| waves | 4 | 4 | rolling bands |

Mean **3.9 at 32×32, 3.6 at 60×1**. The recurring failure mode is not wrong shapes but **too
little brightness at header defaults** (fire, fireworks, fog, lava-lamp, pulse - 5 of 26 score
2 somewhere). That is a prompt-tuning target for a future round ("start bright; a shader that
opens near-black looks off"), not a compile problem.

Contact sheets are not committed (they are ~1 MB of PNG per run and regenerate in seconds):

```
node tools/shader-check/render.mjs tools/shader-check/results/<label>/*.fs --out /tmp/sheets
```

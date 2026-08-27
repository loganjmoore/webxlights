# GOAL: fifty shaders that are actually worth looking at

Hand this whole file to a fresh session. It is the brief, not the answer.

Branch: `claude/shader-generation-goal-o72pk5`.

---

## The objective

Ship **50 shaders** in this repo that a person would stop and watch — the standard is a
professional light show or a paid motion-background pack, not "it compiled".

Getting there means improving three things at once, and the shaders are only the visible one:

1. **The shaders themselves** — 50 committed `.fs` files, curated, distinct from each other,
   shipped into the gallery so every install has them on first run.
2. **The generator prompt** (`ShaderGenerator.php` → `SYSTEM`) — every look that had to be
   hand-fixed to reach the bar is a lesson the prompt should have taught. If round 5 needs the
   same fixes as round 1, the prompt did not improve and the goal failed even if the 50 files
   are pretty.
3. **The evidence** — a measurement harness that can say *why* a shader is good or bad without
   a human squinting at it, so "impressive" stops being a matter of opinion between rounds.

Anything that only achieves (1) is a one-off. The next 50 shaders a user generates would be
as mediocre as today's.

---

## Read this first: the gap, demonstrated

The compile problem is solved. `docs/GOAL-shader-prompt.md` and
`tools/shader-check/results/README.md` record it: the shipped prompt gets **26/26 first-draft
compiles in both dialects** from Haiku 4.5, with zero repairs. Do not re-fight that battle.

The quality problem is wide open. The same results file scores that 26/26 corpus by eye at a
mean of **3.9/5 at 32×32 and 3.6/5 at 60×1** — "recognisable", not "would ship".

This brief was written after generating two shaders through the existing pipeline in this
container and looking at them. Both compiled in both dialects. Neither was good, and the two
ways they failed are the two things this goal exists to fix:

- **`gently falling snow`** rendered as **red dots on a solid blue field**. The shader was
  correct by every rule the prompt states: it declared two colour INPUTs, it drove flakes from
  the first and the sky from the second, and the harness filled them from its test palette
  (red, blue, gold, green) in declaration order — which is exactly what real xLights does.
  It compiled, it was portable, it was palette-obedient, and it looked nothing like snow.
- **`a swirling plasma`** rendered as **muddy browns over large near-black regions**. The
  swirl was there. The colour was not: it `mix()`ed complementary palette entries in linear
  RGB, and the midpoint of red and blue is mud, not purple. Half the canvas sat below the
  brightness a light seen from the street can carry at all.

Neither failure is a compiler's business, which is why the current harness reports both as
passes. The gap between "compiles" and "impressive" is entirely in this territory: colour
that survives an arbitrary palette, brightness that survives night viewing, motion that reads
as flow rather than noise, and a look that is *specific* rather than a generic swirl with the
description's word attached to it.

---

## The reference, and an honest note about it

The look to aim for was given as a YouTube link:
`https://www.youtube.com/watch?v=AhGAgwlzSpo` — **"Video SHADER Effects? It just got real for
Web Design"**, published 2025-02-18.

**This container cannot open it.** `youtube.com` is refused by the network egress proxy
(`EGRESS_BLOCKED`), so the video was never watched. The title and topic came from web search.
Everything below about "the reference aesthetic" is therefore inferred from the genre that
video belongs to, not transcribed from the video. Treat it as a starting hypothesis and say so
in the write-up; if the human who set this goal can describe two or three specific moments
from it, that description beats this section outright.

What that genre looks like, from sources that *are* reachable (Paper Shaders, shadercn,
gradients.design, the 2025 "web shaders" trend writing):

- **Mesh gradients** — a handful of colour poles drifting through each other, no visible seams,
  no bands.
- **Liquid metal and chrome** — bright specular sweeps travelling across a dark warped surface.
- **Iridescence and holographic sheen** — hue that shifts with position and angle rather than
  cycling uniformly.
- **Silk / fabric folds** — smooth directional flow with soft light catching the ridges.
- **Neuro noise and filament networks** — organic, connected, flowing structure.
- **Caustics, godrays, metaballs, plasma** — the demoscene canon done cleanly.
- Universally: **continuous, unhurried motion**; a **committed palette** rather than a rainbow;
  **deep blacks used as negative space, never as most of the frame**; and no jitter.

The single most transferable property is **restraint in structure, boldness in colour**. Almost
every one of these effects is two or three simple fields composed slowly. What makes them look
expensive is that they never flicker, never band, never mud, and never repeat visibly.

---

## The two-audience problem, and how to resolve it

The brief asks for "a good effect like you would see on a light show **or** a motion
background". Those two are not the same canvas, and pretending they are is how this goal
produces 50 mediocre compromises:

| | light show | motion background |
| --- | --- | --- |
| canvas | 60×1, 16×50, 32×32 | 1920×1080-ish |
| detail | none survives; a 1px feature *is* the whole prop | fine detail is the product |
| viewing | across a garden, at night, as points of light | a screen, at arm's length |
| what kills it | low contrast, thin features, desaturation | banding, jitter, obvious repetition |

**The resolution: props are the gate, the screen is the ambition.**

Every one of the 50 must clear the prop bar — that is what this app renders to, and a shader
that only works at 1080p is not shippable here. But every one is also rendered and judged at a
fourth shape, **`screen-192x108`**, and the target is that the *same file* reads as a premium
motion background there. When the two genuinely conflict, the shader branches on `RENDERSIZE`
(the prompt already does this for vertical motion on a roofline) rather than picking a side.

Record how often that conflict is real. If it turns out that ~10 of the 50 can only be
excellent at one size, say so plainly and label them in the manifest — an honest
`bestAt: "matrix"` tag is worth more than a shader that is mediocre everywhere.

---

## What already exists — do not rebuild it

| Thing | Where |
| --- | --- |
| the system prompt | `apps/api/app/Services/ShaderGenerator.php` → `SYSTEM` |
| both-dialect compile harness | `tools/shader-check/check.mjs`, `xlightsDialect.mjs` |
| corpus runner, measured usage | `tools/shader-check/generate.mjs` |
| 26-description regression corpus | `tools/shader-check/corpus.json` |
| contact-sheet renderer | `tools/shader-check/render.mjs` |
| previous bake-off rounds | `tools/shader-check/results/` + its `README.md` |
| the draft gate the app runs | `apps/web/src/lib/shaderDraft.ts` |
| the real preamble | `apps/web/src/lib/webglShaderHost.ts` |
| the ISF parser | `packages/formats/src/isf.ts` |
| the portable subset and the xLights contract | `docs/GOAL-shader-prompt.md` |

`docs/GOAL-shader-prompt.md` is the source of truth for what compiles in both programs. Read
it. Do not relitigate `PALETTE_AT`, `varying`, or the reserved-word list.

---

## Step zero: the environment, or you will measure nothing

Both of these were verified in this container on 2026-08-26. Neither is optional.

```bash
npm install                      # the repo's node_modules are not present on a fresh container
apt-get install -y glslang-tools # provides glslangValidator
```

**Without `glslangValidator`, `check.mjs` reports 0% and it is lying.** Its fallback compiles
xLights' translated source as WebGL2 ES, and xLights' real prepend declares `sampler2DRect`
under `GL_ARB_texture_rectangle`, which ES 3.00 does not have — so *every* shader fails the
xLights dialect with an error about a type the shader never mentions. Two perfectly good
shaders were scored 0/2 this way while writing this brief, and passed 2/2 the moment glslang
was installed. `apt-get install -y glslang-tools` succeeded here; if it ever does not, stop and
report that rather than running the whole goal against a broken oracle.

Generation itself needs no API key: the `claude` binary is on `PATH` and
`generate.mjs --backend claude-cli` uses it, measured at ~13 s and ~1.5k in / ~0.6k out per
shader.

---

## What to build

### 1. `tools/shader-check/metrics.mjs` — make "impressive" measurable

This is the keystone. Build it before generating anything, because it is what makes the
adversarial review argue about evidence instead of taste.

Render each shader to a **frame sequence** — 120 frames at 20 fps (50 ms is this engine's frame
period, `renderFrame.ts`), i.e. 6 s of loop — at each of the four shapes, and compute:

**Brightness and colour** (the plasma failure)
- `meanLuma` — mean relative luminance over all frames and pixels. **Target ≥ 0.35.**
- `deadFrames` — fraction of frames whose 90th-percentile luminance is < 0.25. **Target 0.**
  A show that goes dark for two seconds looks broken from the street.
- `contrast` — per-frame p95 − p05 luminance, take the max over the loop. **Target ≥ 0.45.**
- `chroma` — mean saturation over pixels above the luminance floor. **Target ≥ 0.55**, except
  for shaders whose brief is deliberately monochrome or warm-white.
- `mudFraction` — fraction of lit pixels that are both low-saturation and mid-luminance
  (`S < 0.25 && 0.2 < L < 0.7`). **Target ≤ 0.15.** This is the metric that catches
  `mix(red, blue)` in linear RGB.

**Motion** (does it flow, or does it fizz)
- `motionEnergy` — mean absolute inter-frame pixel delta. **Target 0.01–0.25.** Below the band
  is a still image; above it is strobing.
- `flowCoherence` — Pearson correlation between consecutive frames. **Target ≥ 0.6.** Random
  per-pixel noise scores near zero here while passing `motionEnergy` — this is the metric that
  separates flow from fizz.
- `strobeRate` — count of adjacent-frame whole-canvas luminance swings > 0.5, per second.
  **Hard cap: 3/s.** This is a genuine photosensitivity limit (the same 3 Hz threshold WCAG
  2.3.1 uses), not a style preference. A shader over it is rejected regardless of how it looks.

**Spatial fitness** (does it survive a tiny canvas)
- `aliasEnergy` — fraction of horizontally adjacent pixel pairs differing by > 0.5 luminance,
  at 60×1. **Target ≤ 0.25.** High values are what read as ugly flicker on a real roofline.
- `rooflineLiveness` — at 60×1: variance along x must be non-trivial **and** must change over
  time. Catches the common failure where a vertical effect collapses into a solid colour that
  merely cycles.

**Palette obedience** (the snow failure, half of it)
- `paletteFidelity` — fraction of lit pixels whose hue is within 25° of some palette entry,
  rendered against the fixed regression palette. **Target ≥ 0.7** unless the description names
  its own colours. A shader that hardcodes a rainbow when the user picked red and gold has
  ignored the user.

**Endurance** (a show runs all night)
- `driftDelta` — recompute the headline metrics with `TIME` starting at 600 s and again at
  36000 s. They must match the 6 s window within 15%. Catches precision blow-up, monotone
  drift, and anything that quietly dies after ten minutes. Cheap, and it has no other way of
  being found.
- `nanFraction` — fraction of pixels that are NaN or Inf. **Must be 0.**

**Library-level, computed across all 50**
- `distinctness` — a feature vector per shader (the metrics above plus a coarse spatial-
  frequency and hue histogram), then minimum pairwise distance. **No two of the 50 may be
  near-duplicates.** Fifty plasmas is not a library. Report the closest pairs every round and
  force one of each pair to change or be cut.

Write the thresholds into a committed `tools/shader-check/thresholds.json` with a comment on
each explaining what failure it catches. **They are a starting point, not gospel** — calibrate
them in round 1 against shaders you have looked at, and record any change with the reason. A
threshold that rejects something beautiful is wrong and should move; a threshold that passes
the red-dots-on-blue snow is too loose and should tighten.

**Metrics gate; they do not score.** Nothing here can tell you a shader is beautiful. They tell
you it is not disqualified, and they tell a reviewer where to look.

### 2. Fix `render.mjs` so a reviewer can actually see

The current renderer has three problems, all found by using it:

- It screenshots `fullPage` on a fixed 1400×4000 viewport. Two shaders produced an image that
  was **90% empty background**. At 50 shaders it is unusable. Size the page to its content and
  **page the sheets** — 8 shaders per sheet, so each is large enough to judge.
- It samples **3 time points**. Three stills cannot show whether motion flows or fizzes, which
  is most of what this goal is about. Emit a **filmstrip of 8+ evenly spaced frames per shader
  per shape**, and an animated preview (APNG, GIF, or a short WebM via the bundled ffmpeg) for
  the ones under review. Motion must be reviewed as motion.
- It renders against **one fixed palette** (red, blue, gold, green). That is right for
  regression comparability and wrong for judging beauty — it is half the reason the snow shader
  looked absurd. Render **both**: once with the fixed regression palette (proving the shader
  survives an arbitrary user palette) and once with the shader's own header `DEFAULT` colours
  (showing the look its author intended). A shader that is only good under its own defaults has
  not solved the palette problem; a shader that is only good under the regression palette got
  lucky.

Add `screen-192x108` to `SHAPES`. Keep the three prop shapes exactly as they are so this
round's numbers stay comparable to the committed ones.

### 3. The 50

Fifty concepts, chosen to cover both audiences and to be distinct from each other. Ids are
fixed so results files can be diffed across rounds.

**Light-show canon — these must be excellent, they are what people ask for (12)**
`candy-cane` · `rainbow-sweep` · `comet-chase` · `twinkle-field` · `snowfall` · `firelight` ·
`icicle-drip` · `starburst` · `flag-wave` · `spin-tunnel` · `checker-slide` · `colour-wash`

**Motion-background genre — the reference aesthetic (14)**
`mesh-gradient` · `liquid-metal` · `iridescent-silk` · `caustics` · `neuro-noise` · `metaballs` ·
`godrays` · `aurora-curtain` · `ink-bloom` · `plasma-storm` · `voronoi-crystal` ·
`halftone-pulse` · `moire-drift` · `kaleidoscope`

**Natural phenomena (10)**
`ocean-swell` · `rain-ripples` · `lightning` · `lava-flow` · `smoke-plume` · `sunrise` ·
`cloud-drift` · `plankton-glow` · `dust-storm` · `ember-rise`

**Geometric and rhythmic, built for props (8)**
`vu-bars` · `radar-sweep` · `barber-spiral` · `expanding-rings` · `diagonal-wipe` ·
`pixel-cascade` · `accent-flash` · `marquee-chase`

**Seasonal (6)**
`peppermint-swirl` · `warm-white-sparkle` · `halloween-breath` · `heartbeat` ·
`independence-burst` · `champagne-shimmer`

Write each as a **description a user would type**, in `tools/shader-check/library.json`, and
send it verbatim — you are testing the generator, not hand-feeding it GLSL. Up to **5** may be
swapped out if a concept proves genuinely unshippable at prop sizes, but family coverage must
hold and every swap needs a recorded reason.

### 4. The round loop — five rounds of ten, with teeth

Per round, in order:

1. **Generate.** Ten descriptions through `generate.mjs` with the *current* prompt. Record the
   run in `tools/shader-check/results/` like every previous round.
2. **Gate.** Compile both dialects. Run `metrics.mjs`. Anything failing a hard cap
   (`strobeRate`, `nanFraction`, compile, portability) is dead on arrival — regenerate, do not
   patch.
3. **Look.** Render filmstrips and animated previews at all four shapes, both palettes, and
   actually view them. This is not optional and cannot be delegated to the metrics.
4. **Adversarial review.** Two independent critics, each given *only* the renders, the metrics,
   and the rubric below — **never** the generation prompt, the GLSL, or each other's verdict.
   Each scores 1–5 per shape and must, for every shader, name **one specific defect and one
   specific fix**. "Looks nice" and "needs polish" are both non-reviews; reject them and ask
   again.
   - A shader passes only when **both** critics give ≥ 4 at every prop shape and ≥ 4 at
     `screen-192x108`.
   - Where the critics disagree by ≥ 2, that shader gets a third look. Disagreement is the
     most informative signal in the loop — record what caused it.
   - Do not impose a rejection quota. A quota manufactures rejections of good work; the
     both-critics-≥4 bar is what supplies the teeth.
5. **Rebuttal, once.** The generator side may defend a shader against a specific criticism with
   evidence (a render, a metric). If the criticism was wrong, record that — a critic that
   is systematically wrong about one thing is a rubric bug.
6. **Fix.** Every surviving defect gets fixed. Prefer regenerating with a better description or
   an improved prompt over hand-editing GLSL: a hand-edit fixes one shader, a prompt fix fixes
   every future one. **Every hand-edit must be logged with the reason it could not be a prompt
   fix** — that log is the honest measure of whether the prompt improved.
7. **Re-score.** Metrics and both critics again on the fixed set.
8. **Regress.** Re-run the full 26-item `corpus.json` and compare compile rate to the previous
   round. **Round 2 of the earlier prompt work cost 10 shaders' compile rate from a
   quality-only prompt line** (`results/README.md`) — that is exactly the kind of damage this
   step exists to catch, and it is why the corpus is committed.
9. **Commit** the round: shaders, metrics, review notes (`tools/shader-check/review/round-N.md`),
   and the prompt diff. One commit per round, so the progression is legible in the log.

**Rounds must build on each other.** Round 5 must show measurably better first-pass results
than round 1 — fewer hand-edits, higher first-pass critic scores, fewer regenerations. If they
do not, the prompt is not learning, and the write-up must say so rather than burying it.

At the end, **re-generate rounds 1–2 with the final prompt** and compare against what those
rounds originally produced. That single before/after is the strongest evidence the prompt
improved, and it costs about twenty minutes of generation.

### 5. Improving the prompt

Candidate fixes already visible in the evidence — verify each against the corpus before
keeping it, and delete any that does not earn its length:

- **Never `mix()` two palette colours through their midpoint in linear RGB.** Choose between
  them (`step`/`smoothstep` on a mask), or blend through a bright intermediate, or vary
  brightness within one hue. The midpoint of complementary colours is grey.
- **Open bright.** Header `DEFAULT`s must produce a well-lit frame at `TIME` 0. Five of the
  previously scored 26 lost a point purely to opening near-black.
- **Two colours, related.** Most good-looking effects use one hue family plus one accent, not
  four competing hues. When a shader declares three colour inputs it should still look composed
  if all three come back similar — the user's palette decides that, not the shader.
- **Dark is negative space, not the subject.** Deep black between bright features is what makes
  a prop read; a frame that is mostly dark is a frame that is mostly off.
- **Motion should be slow and continuous.** The genre this is imitating drifts. Default speeds
  should be at the calm end of their range, with the range going faster if the user wants it.
- Anything else a round teaches. Every prompt line must name the failure it prevents.

### 6. Shipping the 50 into the gallery

The 50 must appear in the library for **every** install — including a fresh Docker deploy —
without anyone clicking generate. Two facts, both checked against this repo:

- The runtime image contains `apps/api` and `apps/web/dist` only. **`packages/` is not in it**
  (`Dockerfile`), so nothing at runtime can read `packages/shaders/*.fs` from disk.
- The container runs `php artisan migrate` on every boot and **never runs a seeder**
  (`apps/api/docker/entrypoint.sh`, `DatabaseSeeder.php`). A seeder would work locally and
  silently do nothing in production.

So: keep the authored `.fs` files and manifest under `packages/shaders/library/` (they belong
with the tooling and the tests), and **bake them into a committed JSON under `apps/api/`** with
a generator script plus a test asserting the two are in sync — the same regenerate-and-diff
pattern used for any generated artifact. Publish them with an **idempotent migration** that
upserts on a stable `builtin_key`, so a re-deploy updates the library rather than duplicating
it. `shaders.user_id` is already nullable with a comment explaining that authorless shaders are
expected, so a built-in needs no fake user.

Confirm this design against the code before building it, and record it in `DECISIONS.md` with
the two facts above as the reasoning. If a better mechanism exists, take it and say why.

The gallery also needs to stay usable at 50+ entries: built-ins should be visibly distinct from
user creations, browsable by category, and searchable. `ShadersPage.vue` is one page for
browsing and generating on purpose — read the comment at the top before changing its shape.

---

## The rubric

Score 1–5, independently at `roofline-60x1`, `megatree-16x50`, `matrix-32x32`, and
`screen-192x108`.

| | |
| --- | --- |
| **1** | broken, invisible, or nothing like the description |
| **2** | recognisable but wrong — muddy, too dark, fizzing, banding, or generic |
| **3** | correct and unobjectionable. Nobody would choose it. **This is the current mean.** |
| **4** | good. A person would use it in a show without editing it. |
| **5** | someone asks what that is. Specific, deliberate, beautifully coloured, moves like it means it. |

A 5 is not "more effects on screen". Almost everything in the reference genre is two or three
simple fields composed slowly. It is a 5 because it never flickers, never bands, never muds,
and never visibly repeats.

**Target: mean ≥ 4.3 across all 50 at every shape, no shader below 4 anywhere, at least 12
scoring 5 somewhere.** Publish the distribution, not just the mean — five 5s and twelve 3s is
not the same library as fifty 4s, and the mean hides which one you shipped.

---

## Done looks like

- **50** `.fs` files committed, each compiling in **both** dialects, each passing every hard
  metric cap, each scored ≥ 4 at all four shapes by two independent reviewers.
- The 50 visible in the gallery on a fresh install, by a mechanism proven to work in the Docker
  image and recorded in `DECISIONS.md`.
- `metrics.mjs`, `thresholds.json`, the fixed `render.mjs`, and five committed round reports —
  enough that someone can re-run the whole comparison rather than take the write-up's word.
- An improved `SYSTEM` prompt, with the round-1-vs-round-5 regeneration showing the improvement
  and the 26-item corpus showing no compile regression.
- `docs/SHADER-LIBRARY.md`: the rubric, the round-by-round numbers, the score distribution, the
  hand-edit log, the closest-pair distinctness report, and what is still not good enough.
- Green CI: `npm run lint && npm run typecheck && npm run test`, and `php artisan test`.

## Ground rules

- Branch `claude/shader-generation-goal-o72pk5`. Push with `-u`. Open a ready-for-review PR.
- **Re-sync at the top of every turn** — `git fetch origin main && git checkout -B <branch>
  origin/main`. This container restores an old working tree between turns and it has caused a
  wrong diagnosis in this project before.
- `npm install` and `apt-get install -y glslang-tools` after every container restart. Check
  `which glslangValidator` before trusting any compile number.
- Full suite, typecheck, lint and build before every commit.
- Never put a model identifier in a commit message, PR body, or code comment.
- Prices and dated measurements go in the docs with the date they were checked, never in code.

## What this cannot verify, stated plainly

- **No session can run real xLights.** This container has no desktop. Compiling against
  xLights' real preamble and real source rewrites is strong evidence and is not the same claim.
  Put the 50 through `docs/SHADER-XLIGHTS-CHECK.md` for the one step only a human at an
  xLights install can do, and say in the PR: compiled against xLights' contract, **not** run in
  xLights.
- **The reference video was never watched** (egress-blocked, see above). The aesthetic section
  is inferred from the genre. If it is wrong, everything downstream of it is aimed slightly off
  — get it corrected early rather than late.
- **Two model reviewers are not a human audience.** They share failure modes, and they may
  agree with each other and still be wrong about what looks good from a garden at night. The
  contact sheets and previews are committed so a person can overrule them, and the honest
  version of the final claim is "scored ≥ 4 by two independent automated reviewers against a
  published rubric", not "these are beautiful".

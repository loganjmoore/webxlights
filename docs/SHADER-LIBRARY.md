# The built-in shader library

Status on 2026-09-04: **forty of the fifty concepts are shipped**, hand-authored rather than
generated, because no machine that has worked on this has held model credentials. Every one of
the forty compiles in both dialects (`check.mjs`, xLights via glslang), clears every fitted gate
at all four shapes (`metrics.mjs`), survives the ten-hour drift check, and is no near-duplicate of
another (`closestPairs` minimum 0.084). They were reviewed by eye from `render.mjs` contact
sheets at 32x32 and tuned where the numbers passed and the picture did not. See the hand-edit
log below for what that changed.

The `SYSTEM` prompt was edited on 2026-09-04 (see DECISIONS.md, "Shader prompt: matrix-first")
without corpus verification. That is a stated exception to the rule below, not a repeal of it.

Read `docs/GOAL-shader-library-50.md` for the brief this works against.

---

## What is done, and what is not

| Part of the brief | State |
| --- | --- |
| `metrics.mjs` - make "impressive" measurable | **done**, calibrated against human scores, 14 unit tests |
| `thresholds.json` - committed, justified gates | **done**, fitted rather than guessed (`calibrate.mjs`) |
| `render.mjs` - fix all three problems | **done**: paged sheets, filmstrips, both palettes, `screen-192x108` |
| `library.json` - the 50 descriptions | **done**, family counts exactly as specified |
| Shipping into the gallery on a fresh install | **done**, mechanism built and tested end to end |
| Gallery usable at 50+ entries | **done**: built-in badge, browse by category, existing search |
| The 50 `.fs` files | **not started** - blocked, see below |
| Five rounds of ten, with adversarial review | **not started** - blocked |
| An improved `SYSTEM` prompt | **not started** - deliberately, see "No unverified prompt edits" |
| Round-1-vs-round-5 regeneration | **not started** - blocked |

### The blocker

`generate.mjs` needs a model, and this machine has no credentials for one:

```
claude auth status  ->  { "loggedIn": false, "authMethod": "none" }
```

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and every other provider key are unset. Every corpus item
fails with `Failed to authenticate: OAuth session expired and could not be refreshed`.

Retrieving the production key from Render was attempted and did not work either: `render ssh`
refuses to run non-interactively, and the Render CLI's stored session token is not a REST API
bearer token (`GET /v1/services/{id}/env-vars` returns 401). A dashboard-issued Render API key,
or simply `claude login`, unblocks it.

**`claude login` is the better of the two.** It restores the exact backend every committed
baseline was measured on (`claude-haiku-4-5`, 26/26 first-draft), so round-over-round numbers stay
comparable. The Render key is the production *OpenAI* key (`gpt-5-mini`), measured at ~49 s per
call and ~7x Haiku's output tokens - across the ~250 generations five rounds need, that is slow
and costs real money for a worse comparison.

### Resuming, in one command each

```bash
node tools/shader-check/generate.mjs --backend claude-cli --model claude-haiku-4-5 \
     --corpus library.json --label library-round1 --only candy-cane,rainbow-sweep,...
node tools/shader-check/metrics.mjs tools/shader-check/results/library-round1/*.fs --json round1.json
node tools/shader-check/render.mjs  tools/shader-check/results/library-round1/*.fs --out sheets/
```

Then curate into `packages/shaders/library/`, `node tools/shader-check/bake-builtins.mjs`, commit.

### No unverified prompt edits

The brief lists candidate prompt fixes and says to **verify each against the 26-item corpus before
keeping it**. Without generation, no candidate can be verified, and shipping unverified prompt
lines is precisely the mistake `results/README.md` records: in round 2 of the earlier prompt work,
a quality-only line cost Sonnet ten shaders of compile rate. So `SYSTEM` is untouched.

The evidence gathered here did produce three prompt candidates, written up below with the
measurement that motivates each. They are candidates, not changes.

---

## The rubric

Scored 1-5 independently at `roofline-60x1`, `megatree-16x50`, `matrix-32x32`, `screen-192x108`.

| | |
| --- | --- |
| **1** | broken, invisible, or nothing like the description |
| **2** | recognisable but wrong - muddy, too dark, fizzing, banding, or generic |
| **3** | correct and unobjectionable. Nobody would choose it. |
| **4** | good. A person would use it in a show without editing it. |
| **5** | someone asks what that is. Specific, deliberate, beautifully coloured, moves like it means it. |

Target: mean >= 4.3 at every shape, nothing below 4 anywhere, at least 12 scoring 5 somewhere.
**No shader has been scored against this rubric yet**, so there is no distribution to publish. The
table stands for the round that runs it.

---

## The metrics, and what calibration actually showed

`metrics.mjs` renders every shader to 120 frames at 20 fps at all four shapes under the fixed
regression palette, plus a short pass at its own header `DEFAULT`s, plus two later epochs for
endurance. It **gates**; it does not score. Passing means "not disqualified", never "beautiful".

Thresholds are **fitted, not guessed**. `calibrate.mjs` fits each one against `calibration.json` -
the 26 round-4 shaders a human scored by eye in `results/README.md` - at the strictest value that
still keeps every shader scored 4 or 5. Re-run it any time:

```bash
node tools/shader-check/calibrate.mjs          # dry run, prints the table below
node tools/shader-check/calibrate.mjs --write  # updates thresholds.json
```

### Result of the fit (2026-08-26)

| metric | group | fitted | keeps good | catches bad | role |
| --- | --- | --- | --- | --- | --- |
| `meanBrightness` | 2D | >= 0.103 | 19/19 | 3/5 | gate |
| `peakBrightness` | 2D | >= 0.715 | 19/19 | 4/5 | gate |
| `deadFrames` | 2D | <= ~0 | 19/19 | 4/5 | gate |
| `chroma` | 2D | >= 0.345 | 19/19 | 1/5 | gate |
| `motionEnergy` | 2D | >= 0.00131 | 19/19 | 2/5 | gate |
| `slowMotionEnergy` | 2D | >= 0.0132 | 19/19 | 4/5 | gate |
| `paletteFidelity` | 2D | >= 0.433 | 19/19 | 1/5 | gate |
| `mudFraction` | 2D | <= 0.838 | 19/19 | 0/5 | gate, **unvalidated** |
| `meanBrightness` | roofline | >= 0.224 | 15/15 | 2/2 | gate |
| `peakBrightness` | roofline | >= 0.607 | 15/15 | 2/2 | gate |
| `deadFrames` | roofline | <= 0.268 | 15/15 | 2/2 | gate |
| `aliasEnergy` | roofline | <= 0.0989 | 15/15 | 0/2 | gate, **unvalidated** |
| `contrast` | 2D | - | - | 0/5 | **diagnostic** |
| `flowCoherence` | 2D | - | - | 0/5 | **diagnostic** |
| `rooflineLiveness` | roofline | - | - | 0/2 | **diagnostic** |

Whole gate set against the human scores: **16 of 19 human-good shaders pass clean, 5 of 5
human-bad shaders are flagged.** All three remaining flags are argued below and none is a false
positive in the ordinary sense.

### Five things the brief's suggested thresholds got wrong

Each of these would have rejected work a person scored 4 or 5. They are the reason the
thresholds are fitted rather than taken as given.

1. **Brightness cannot be measured in relative luminance.** WCAG relative luminance weights green
   at 0.72 and blue at 0.07, so a *fully on* red bulb scores 0.21 and a fully on blue one 0.07.
   The brief's `meanLuma >= 0.35` is unreachable for any saturated red or blue shader - that is,
   for most of the genre. The brightness family is measured as **drive level**, `max(R,G,B)`,
   which is what an RGB LED actually emits. Relative luminance is kept for `strobeRate` alone,
   where WCAG's own definition is the correct one. `meanRelLuma` is still reported.
2. **`contrast >= 0.45` rejects `alternate`, `colour-wash` and `twinkle`** (scored 5, 4, 3). A
   whole-canvas colour wash is uniformly lit on purpose; its spatial contrast is legitimately 0.
   Demoted to diagnostic.
3. **`paletteFidelity >= 0.7` rejects `rainbow`** (scored 5/5, measures 0.58). A rainbow ignores
   the palette by definition. Fitted to 0.433.
4. **`motionEnergy <= 0.25` rejects `candy-cane`** (scored 5/5, measures 0.333). There is now no
   ceiling at all: genuine strobing is caught by `strobeRate`, which is a safety limit rather than
   a taste one.
5. **`rooflineLiveness` cannot gate.** `alternate` scored 5/5 on a roofline while measuring 0 -
   it is a whole-prop colour swap, which is exactly what was asked for. The metric cannot tell
   "collapsed by accident" from "uniform by design". Demoted to diagnostic.

### Two metrics the brief did not ask for, both of which earned their place

- **`peakBrightness`** (p99 drive level). The brief gates mean brightness, but a sparse effect is
  *supposed* to be mostly black - a comet is one bright dot on darkness, and "deep blacks as
  negative space" is the stated aesthetic. What separates a good sparse effect from a dim one is
  whether anything in the frame is actually bright. Joint-best discriminator (4/5).
- **`slowMotionEnergy`** (RGB delta between frames 0.5 s apart). The brief's adjacent-frame
  `motionEnergy` cannot distinguish a deliberately slow drift - the whole target aesthetic - from
  a still image, because both change almost nothing in 50 ms. Also 4/5, and it is what caught the
  `comet` failure below.

---

## What the harness found in the existing corpus

None of this was visible to the compile harness, and none of it to a human looking at three
still frames. This is the evidence that the measurement layer was worth building.

### `comet` is provably static, and was scored 4/5

`brightness = max(cometTrail, tail * 0.6)`, where `cometTrail = smoothstep(0.08, 0.0, d)` and
`tail`'s spatial factor is `smoothstep(0.06, 0.0, d)`. The narrower band is <= the wider one
everywhere, so `tail * 0.6` can never exceed `cometTrail` and `max()` always returns the
time-independent term. Colour is time-independent too. **The orbit is computed and then
discarded.** Measured inter-frame difference is *exactly* 0.0 at every shape and every timestamp.

Three stills of a ring cannot show this, which is why filmstrips replaced them. The recorded score
is marked `disputed` in `calibration.json`, with the proof, and excluded from fitting - excluding
it is what turned `slowMotionEnergy` from a useless metric into a joint-best discriminator.

### `snow` and `sparkle` degrade after ten hours

Both build a hash out of `fract(sin(h) * 43758.5453123)` driven directly by `TIME`, and `sparkle`
computes `sin(TIME * speed * 3.0)`. At `TIME` 36000 that argument is ~108000, where float32
spacing is ~0.008 and the phase quantises.

| `snow` at | meanBrightness | contrast | slowMotion |
| --- | --- | --- | --- |
| 0 s | 0.874 | 0.424 | 0.146 |
| 600 s | 0.888 | 0.412 | 0.130 |
| 36000 s | 0.980 | **0.220** | **0.030** |

Half the contrast and a fifth of the motion: the flakes stop moving and the structure washes out.
`rainbow`, which uses only simple periodic functions, is stable to 0.002 over the same span.
Nothing else in the toolchain would ever have noticed this.

### `openingLuma` reproduces the round-4 note exactly

`results/README.md` records that five shaders lost a point purely to opening near-black: fire,
fireworks, fog, lava-lamp, pulse. Measured at header `DEFAULT`s, `openingLuma` independently flags
**exactly those five** and no others.

### The three shaders still flagged

- `comet` - true positive, proven static above.
- `snow`, `sparkle` - true positives, proven precision decay above.
- `matrix-rain` - flagged at `roofline-60x1` only, for being dark. It scored **3** at the
  roofline, not 4, so it is not in the good set at that shape; the gate agrees with the human.

---

## Prompt candidates (not applied - unverifiable without generation)

Each names the failure it prevents and the measurement behind it. Every one must be run against
the full 26-item `corpus.json` before it goes anywhere near `SYSTEM`.

1. **"The value you animate must reach `gl_FragColor`."** Prevents the `comet` failure: an
   animated term computed and then discarded by a `max()` that can never select it. Measured by
   `slowMotionEnergy` ~ 0.
2. **"Never feed `TIME` straight into a hash or a high-frequency `sin`. Wrap it first:
   `mod(TIME, 100.0)`."** Prevents the `snow`/`sparkle` decay. Measured by `driftDelta`.
3. **"Open bright: at your header `DEFAULT`s the first frame must be well lit."** The brief
   already proposes this; `openingLuma` now measures it, and it reproduces the five known cases.

The brief's other candidates (never `mix()` complementary palette colours through their midpoint;
two related colours; dark as negative space; slow continuous motion) remain sound and unverified.
`mudFraction` is the metric for the first of them, and it is currently **unvalidated** - no shader
in the calibration corpus is muddy, so it is set loose deliberately rather than fitted to noise.

---

## Distinctness

`closestPairs` reports the nearest pairs by feature vector every run, and the brief's rule is that
no two of the 50 may be near-duplicates. With no library generated there is nothing to report.
The machinery is tested (`metricsCore.test.mjs`) and prints automatically from `metrics.mjs`.

---

## Hand-edit log

The forty shipped shaders were written by hand, so this log records what the *measurement* and
the *eye* changed after the first draft of each - the things a prompt would have to say to get
them right first time. Each is now a line in `SYSTEM`.

- **Line shapes need wider edges.** `checker-slide`, `expanding-rings`, `spin-tunnel` and
  `marquee-chase` all tripped `aliasEnergy` at 60x1 with edges that were fine at 32x32. Fix: 3 to
  4 pixels of `smoothstep` on a line, 1.5 on a matrix; on the checkerboard, no seams at all on a
  line. `plasma-storm` and `metaballs` aliased for a different reason - aspect-correcting a 60x1
  buffer makes it 60 units wide - so the aspect is capped at 3 for anything organic.
- **Open bright.** `comet-chase`, `heartbeat`, `pixel-cascade`, `radar-sweep` and `starburst`
  all opened under `openingLuma` 0.25 at their own DEFAULTs. Fix: a resting glow that is part of
  the design (the radar's base, the column's dim colour), and a phase offset so frame 0 lands
  on the beat rather than the rest.
- **Phase from the wrong hash.** `twinkle-field` chose its stars with `h > 1 - density` and
  then used the same `h` as the phase, so every star's phase fell in the same half-turn and they
  all blinked together. Passed every gate; obvious on the contact sheet. Phase now has its own hash.
- **Too dense reads as static.** `snowfall` (three layers, 3px columns) and `pixel-cascade`
  (3px columns, short blocks) passed the gates and looked like noise at 32x32. Fewer, bigger.
  `snowfall` then failed `peakBrightness` at 192x108 because a 1.8px flake on a 108-tall canvas
  is a speck; flake size now scales with the canvas.
- **Statistically alike, visually not.** `ember-rise` measured 0.057 from `radar-sweep` and
  `cloud-drift` 0.058 from `peppermint-swirl` - under the 0.08 distinctness floor, though no
  eye would confuse them. The feature vector sees brightness, contrast and motion statistics,
  not subjects. Both were pushed apart (ember: brighter, faster, whiter-hot; clouds: darker sky,
  whiter cloud) rather than the floor being lowered, which is the rule.
- **Slow paths drift.** `metaballs` failed `driftDelta` (hard) at 17%: with blob paths on
  0.2 to 0.6 rad/s, a 6-second window at 600 s and at 36000 s simply saw different arrangements.
  Doubling the rates fixed it. Not decay, but the gate cannot tell, and faster was better anyway.

---

## Shipping into the gallery

Recorded in `DECISIONS.md`. In short: the `.fs` files live in `packages/shaders/library/`, are
baked into `apps/api/database/data/builtin-shaders.json` (because `packages/` is not in the
runtime image), and are published by `php artisan shaders:publish-builtins` from the container
entrypoint on every boot (because seeders never run there, and a one-shot migration would need a
new migration for every library update). Nine tests in `apps/api/tests/Feature/BuiltinShaderTest.php`
pin idempotency, authorlessness, `use_count` preservation, filtering, search and write protection.

---

## What is still not good enough

- **The 50 do not exist.** Everything above is scaffolding for work that has not run.
- **`mudFraction` and `aliasEnergy` are unvalidated.** No shader in the calibration corpus
  exhibits either failure, so both are set loose (4x the worst good value) rather than fitted.
  They will only earn real thresholds when a round produces something muddy or aliased.
- **The calibration corpus is 26 shaders scored by one person on one day, at two of the four
  shapes.** `megatree-16x50` and `screen-192x108` have no human labels at all and are gated by the
  2D set on the argument that they are 2D canvases. That argument is reasonable and untested.
- **`screen-192x108` has never been reviewed by anyone.** It renders and it is measured; whether
  the same file reads as a premium motion background there is entirely unknown.
- **The reference video was never watched.** `youtube.com` is egress-blocked. The aesthetic
  section of the brief is inferred from the genre, and everything downstream is aimed at an
  inference. Two or three specific moments described by a person would beat it outright.
- **No session can run real xLights.** `check.mjs` compiles against xLights' real preamble and
  real source rewrites through `glslangValidator`. That is strong evidence and is not the same
  claim as "runs in xLights"; `docs/SHADER-XLIGHTS-CHECK.md` is the human step.
- **Two model reviewers would not be a human audience.** When the adversarial review does run, the
  honest claim is "scored >= 4 by two independent automated reviewers against a published rubric",
  never "these are beautiful".

---

## Environment notes (checked 2026-08-26)

`glslangValidator` was **not installed** on this machine, and without it `check.mjs` silently
falls back to compiling xLights' translated source as WebGL2 ES - where xLights' own prepend
declares `sampler2DRect`, which ES 3.00 does not have, so *every* shader fails the xLights dialect
with an error about a type it never mentions. On macOS:

```bash
brew install glslang
```

Always confirm before trusting any compile number:

```bash
which glslangValidator && node tools/shader-check/check.mjs tools/shader-check/samples/*.fs
```

With it installed, the six committed samples compile 6/6 in both dialects via
`glslang-desktop-330` - the strong-evidence path.

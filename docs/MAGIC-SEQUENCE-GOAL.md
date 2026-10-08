# Magic Sequence: goal prompt

Paste the block below into Claude Code in this repo (it starts with `/goal`). It builds phases
0-4 of [MAGIC-SEQUENCE.md](MAGIC-SEQUENCE.md). Phase 5 (vocals, chat edits, learned picker) is
out of scope on purpose.

Before running: nothing to buy and no new accounts. The AI director uses the Anthropic key the
shader assistant already uses; without one, everything still works through the rules director and
the API tests use a fake provider.

```text
/goal Build the Magic Sequence button in webXLights, phases 0-4 of docs/MAGIC-SEQUENCE.md. Read that spec in full first, then CLAUDE.md, DESIGN.md, tools/sequence-corpus/README.md and tools/sequence-corpus/priors.json. The spec is the source of truth; where code and spec disagree, read the code, decide, and record the decision in the spec.

Work on a branch per phase off main (magic-0-groundwork, magic-1-analysis, magic-2-generator, magic-3-director, magic-4-score), one PR per phase, merged in order once CI is green. Small commits. Add a test with every fix (CLAUDE.md).

Phase 0, groundwork:
- importEffectSettings(name, rawSettings) in apps/web/src/lib/xsqEffectSettings.ts as the exact inverse of exportEffectSettings, driven by the same PARAMS table. Use it in .xsq import (packages/formats only translates 5 effects today). Test: every PARAMS entry round-trips engine->xLights->engine, and a settings string built from each effect's priors.json parameterPresets (medians and modal choices) imports to the matching engine params.
- Fix the .xsq reader's layer order (first <EffectLayer> is the TOP layer in xLights; the writer is already right). Round-trip test: parse 2-layer xsq -> import -> exportSequenceToXsq -> same native layers. Skip if already fixed on main.
- Port tools/sequence-corpus/roles.mjs to apps/web/src/lib/propRoles.ts (role + tier + dims + side per model/group/submodel, group role by majority of members, user override in model params.magicRole). Tests against the sample layouts in packages/formats/test/fixtures and synthetic layouts covering every role.
- Load tools/sequence-corpus/priors.json into the app at build time as typed data (apps/web/src/lib/magic/priors.ts). Do not commit anything from tools/sequence-corpus/.corpus.
- Fix packages/engine/test/perf.test.ts ("ColorWash" -> "Color Wash") and correct the CLAUDE.md worker-pool line.

Phase 1, song analysis (packages/engine, in a Web Worker):
- Port the tempo/beat/downbeat/section/drum-hit analysis from LightsAutoSequencer (https://github.com/computergeek1507/LightsAutoSequencer, js/analysis.js, GPL-3.0, same licence as this repo) to TypeScript, with attribution in each ported file's header and in a NOTICE section. Adapt it to the existing analyzeAudio/spectralFlux/detectOnsets code rather than duplicating FFT code.
- Produce the SongMap of spec section 2.1: beats, downbeats, sections with labels/groups/energy/rank, per-beat energy, hits, impacts, confidence. Section rules: merge < 2 bars, split > 32 bars at the strongest novelty peak, snap to bars then 4-bar phrases.
- Cache the SongMap in the sequence's metadata keyed by an audio hash.
- Tests with synthetic audio generated in the test (no binary fixtures): 120 BPM click track -> bpm within +/-1 and beat F-measure >= 0.95 at +/-70 ms; 90 and 150 BPM likewise; an A-B-A-B-C-B song built from two chord loops and a louder chorus -> boundaries within 1 bar, A sections share a group, the loudest repeated group is labelled chorus; a quiet-loud-quiet track -> energy rank matches. Benchmark: a synthetic 4-minute song analyses in under 5 s in vitest (log the time).

Phase 2, rules generator and UI:
- apps/web/src/lib/magic/: feels.ts, director.ts (rules director -> ShowPlan), choreograph.ts (pure, seeded, spec section 2.4), apply.ts (one undo via store.addEffects; Magic Beats/Bars/Sections fixed timing tracks; songBoundaries; modes fill-empty / replace / new-layers; optional "Magic: <Role>" groups for roles without a group).
- Unit tests on choreograph with a synthetic SongMap and apps/web/test/fixtures/magic-layout.json (create it here: ~30 props, every role): no overlapping effects on one layer; all effects inside [0, duration]; >= 85% of effect starts on SongMap beat or half-beat marks (bar marks below 90 BPM); same seed -> identical output, different seed -> different output; only effects allowed for each role and renderable on its dims; share of props lit in the loudest section is at least 1.5x the quietest (corpus median 1.9x), heroes lit at least 60% of the song and other roles near their priors coverage; adjacent sections never identical; whole-house hits per minute <= priors p75; effect-by-role Jensen-Shannon divergence vs priors below the threshold the spec sets (compute and record the corpus between-song spread to set it).
- UI per spec section 4 and DESIGN.md: toolbar button, Sequence menu item and Cmd+K command; ModalPanel dialog with song/feel/colours/props/mode; disabled with a tooltip when the sequence has no audio; honest progress text; Generate, Try another, Undo.

Phase 3, AI director:
- POST /v1/sequences/{sequence}/magic-plan in apps/api: Project::authorize (editor), throttle:10,1, MAGIC_DAILY_LIMIT/MAGIC_MONTHLY_LIMIT on the existing credit ledger, bring-your-own-key headers like the shader assistant, RequestScreen on the free-text direction, MAGIC_MODEL defaulting to claude-opus-5-5. Use the claude-api skill before writing the Anthropic call: structured output via output_config.format (forced tool_choice is a 400 on Opus 5.5 / Sonnet 5.5). Validate every field server-side against the effect whitelist per role, hex colours, and section indices; drop invalid parts. The client fills gaps from the rules director, and any failure (no key, timeout, 429, invalid JSON) falls back silently to the rules director with a one-line notice.
- PHP feature tests with a faked provider: authorization (viewer 403, non-member 403), caps, validation drops bad effects, fallback on provider error. The button works with no provider configured.

Phase 4, score and tune:
- Headless fit score (spec section 2.6: loud, beat, lift, style, variety) computed in vitest through the engine's existing renderer (createRowSequencer / exportSequenceToFseq), sampled at 4 Hz with a node stride, each prop weighted equally.
- Fetch 3 public-domain or CC0 Christmas recordings of different character (one upbeat, one slow, one dramatic; Wikimedia Commons or Musopen), record title, URL and licence in tools/sequence-corpus/test-songs.md, keep the audio out of git (gitignored folder, fetched by a script). Run the generator on each against a committed synthetic layout, apps/web/test/fixtures/magic-layout.json (about 30 props built from real xLights model types, covering every role in propRoles.ts, with a few role groups and a whole-house group); tune feels/weights until each song scores >= 60 with every sub-score above its floor; record the scores and the tuning changes in the spec.
- Run the real app (npm run dev + php artisan serve), create a project, import a real layout (one of the xlights_rgbeffects.xml files under tools/sequence-corpus/.corpus/raw, local only, never committed; fall back to magic-layout.json if the corpus folder is empty), upload one of the test songs, press Magic Sequence, and capture screenshots of the dialog, the generated grid and the house preview mid-chorus. Attach them to the phase 4 PR.

Done when all of these hold, each shown with the command and its output (not "should work"): every phase's tests pass; npm run lint, npm run typecheck, npm run test, cd apps/api && php artisan test, and docker build . all pass locally; all five PRs are merged with CI green; the screenshots exist on the phase 4 PR; docs/MAGIC-SEQUENCE.md is updated with what changed, the measured fit scores, and anything deferred.

Constraints: CLAUDE.md locked decisions hold (CSP: no third-party scripts at runtime, so any model or library is bundled or self-hosted; COOP/COEP; Node 22/PHP 8.4). No new paid services, no GPU hosts, no new accounts. Beat This! ONNX, Demucs, Whisper and hosted section models are out of scope for this goal. Never copy sequences or settings strings from the corpus into the repo; only priors.json aggregates. If a phase is blocked by something only Logan can do, write it in docs/MAGIC-SEQUENCE.md under "Blocked", skip to work that isn't blocked, and say so at the end.
```

## What the run will need from you

- Nothing up front. If you want the AI director live in production, the existing
  `ANTHROPIC_API_KEY` / `SHADER_API_KEY` on Render covers it; set `MAGIC_DAILY_LIMIT` and
  `MAGIC_MONTHLY_LIMIT` there if you want caps different from the defaults the run picks.
- To refresh the corpus later: sign in to xlightsseq.com in Chrome and re-run the download step in
  `tools/sequence-corpus/README.md`, then `node tools/sequence-corpus/analyze.mjs
  tools/sequence-corpus/.corpus/raw` and commit the new `priors.json`.

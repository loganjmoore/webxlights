# Changelog

## M5 — fseq export + xsq import

- `packages/formats`: `writeFseqV2`/`parseFseqV2Header`/`readFseqV2Frame` — an uncompressed FSEQ v2 writer/reader matching the SPEC ch11 §5.2 byte layout exactly (verified byte-by-byte against a hand-computed example, plus round-trip write→parse→read tests).
- `packages/formats`: `parseXsq` + `parseSettingsString` + `translateEffectParams` — a `.xsq` importer resolving `EffectDB`-ref and inline effect settings, translating 5 effects' `E_*` keys into this engine's typed params (On, Bars, Color Wash, Twinkle, Spirals), dropping `Random`-named and zero/negative-duration effects per SPEC load behavior, and reporting which effect names didn't get a param translation.
- `apps/web`: an "Export .fseq" button on the sequencer page (renders every frame through the M3/M4 pipeline, concatenates supported models' channels, downloads a `.fseq` file — zero infrastructure, matches SPEC ch16's own "Mitigation 1, ship first" recommendation) and an "Import .xsq" flow on the sequences list (creates a populated sequence, matches model rows to the layout by exact name, navigates straight to the result).
- Verified live: exported a real sequence's `.fseq` and confirmed the header (`PSEQ`, v2, correct frame/channel counts — channel count matched the imported layout's node count exactly: 3510 = (800+250+360) nodes × 3) via the same parser used in tests; imported a synthetic `.xsq` with a matched model, an unmatched model, and an untranslated effect, and confirmed all three were handled correctly (effects placed, unmatched model skipped and reported, untranslated effect kept with correct name/timing).
- Simplifications recorded in DECISIONS.md: uncompressed-only fseq (zlib/zstd deferred), placeholder channel layout (no real controller/universe allocation yet), exact-name-only model mapping, no R2 archiving (still blocked), and no physical-hardware playback verification (round-trip parse + hand-computed byte checks instead).

## M4 — Live preview

- `packages/engine`: `renderRowAtMs` — the frame-render pipeline that finds a row's active effects at a given playhead time, composites them through M3's layer stack (stateful effects like Fire/Meteors/Snowflakes replay from the effect's start to reach the target frame), and maps the result to node colors. 6 new tests.
- `apps/web`: `HousePreview.vue` — a Three.js `THREE.Points` scene showing every model's nodes at their M1 layout positions, colored live from `renderRowAtMs`. Wired into the sequencer page above the waveform; updates on playhead change (scrub or play) and on effect/param edits (both already reactive through the M2 store).
- Verified live in-browser: seeking the playhead into an effect's active range lights the correct model in the preview with the correct color; seeking outside the range goes dark; both confirmed via screenshots.
- Simplifications recorded in DECISIONS.md: main-thread rendering (worker pool/SAB deferred to a perf-hardening pass, M9 is where budgets are actually gated), stateful effects replay-from-start per call, no per-model mini-preview yet, one fixed default palette (no palette editor until M6/M7).

## M3 — Render engine v1

- `packages/engine`: 9 new effects faithful to their SPEC ch7-8 render algorithms — Bars, ColorWash, Fire (stateful, Old Render Method), Meteors (stateful particle system), Butterfly, SingleStrand (Chase), Snowflakes (stateful), Spirals, Twinkle — joining the existing "On" for 10 total.
- 10 layer blend modes (`blend.ts`) implementing the exact per-pixel math from SPEC ch9 §5.2's `mixColors` table: Normal, Effect 1, Effect 2, Average, Additive, Subtractive, Max, Min, 1 reveals 2, 2 reveals 1.
- `layerStack.ts`: bottom-to-top layer compositor (up to 5 layers) built on the blend modes.
- `nodeMapping.ts`: buffer → node colors → RGB-order-aware channel bytes, closing the loop from "effect renders a buffer" to "output channel data" that M1's model geometry started.
- `rng.ts`: seeded `mulberry32` PRNG + deterministic hash RNG, shared by every stateful/random effect so "same seed → identical frames" holds.
- Extended `EFFECT_SCHEMAS` and the M2 sequencer's props panel (added a `choice` control type) so all 10 effects are placeable and editable in the UI today, not just tested in isolation.
- 75 tests across 16 files: hand-computed golden frames where the math is tractable by hand (Bars, ColorWash), structural/determinism checks for the procedural and stateful effects (Fire, Meteors, Butterfly, Snowflakes, Twinkle, Spirals), plus dedicated blend-mode and node-mapping suites. Every stateful effect (Fire, Meteors, Snowflakes) has an explicit "same seed → identical frames across multiple frames" test.
- Verified live in the M2 sequencer UI: placed a Bars effect, changed its Direction via the new choice dropdown, confirmed the change persisted through autosave.
- Simplifications recorded in DECISIONS.md — each effect implements its default/most-common path faithfully; rarer option combinations (alternate directions, other Butterfly styles, Fire's New Render Method, etc.) are documented ceilings, not silent gaps. Worker pool / SharedArrayBuffer frame store deferred to M4.

## M2 — Sequencer shell + audio

- `packages/engine`: `EFFECT_SCHEMAS` param-schema registry (SPEC ch7-9 tables → UI control descriptors), matching the `On` effect's params exactly.
- `apps/api`: `sequences` table (`frame_ms` gated to the SPEC ch6 values, `body` jsonb), CRUD + a `PUT .../body` autosave endpoint. 13 feature tests.
- `apps/web`: new-sequence flow (audio file → decode → frame interval), `Waveform.vue` (peaks canvas), `SequencerGrid.vue` (canvas grid: rows from the layout's models/groups, click-drag to place/select/move/resize effects), `EffectPropsPanel.vue` (dynamic form from the schema registry), a Pinia `sequencer` store (undo/redo, autosave, copy/paste).
- Verified end-to-end in-browser: created a sequence from a synthesized WAV, placed an "On" effect on a model row by dragging, edited its params live, deleted it, undid the delete, and confirmed the placement survives a full page reload (Postgres-backed autosave).
- Found and fixed two real bugs only visible by actually running the UI (see DECISIONS.md "Bugs found only by actually running the UI"): a canvas-height render-timing bug that made the grid invisible on first load, and a `structuredClone()` vs. Pinia-reactive-object crash that silently no-op'd every single mutation (arm effect, drag, nothing happens, no visible error) until fixed.
- Simplifications recorded in DECISIONS.md (audio not R2-backed, snapshot-based undo instead of command-pattern, single-effect param schema, manual-only timing marks).

## M1 — Layout MVP + rgbeffects import

- `packages/engine`: node-coordinate geometry for all 12 M1 model types (Matrix, Single Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath, Custom) — 17 unit tests verifying node-count formulas against SPEC ch4. `computeGeometryFromAttrs` maps a raw xLights attribute bag straight to geometry.
- `packages/formats`: `parseRgbEffectsXml` parses `xlights_rgbeffects.xml` into models (raw attribute bag preserved) + groups; unsupported `DisplayAs` types are kept (not dropped) and reported.
- `apps/api`: `layouts`/`models`/`model_groups`/`model_group_members` schema; a project auto-creates its layout on creation; bulk-upsert endpoints (idempotent by name) so the client-side importer persists an entire show in two requests.
- `apps/web`: file-input import UI, a `<canvas>` layout renderer (auto-fit, unsupported types drawn as labeled placeholder boxes so nothing imported is silently invisible), model list sidebar.
- Verified end-to-end in-browser: imported a 4-model/2-group synthetic show, 3 supported types rendered at their relative `WorldPosX/Y` positions, the unsupported type (Spinner) showed as a placeholder and was listed in the import summary; survived reload (Postgres-backed).
- Simplifications recorded in DECISIONS.md (Matrix/Arches/Star/Circle parameter subsets, Custom's compressed grid format, screen placement via WorldPos only, no drag-to-reposition yet).

## M0 — Skeleton + deploy

Live at https://webxlights-web.onrender.com.

- Monorepo scaffold: `apps/web` (Vue 3 + TS + Vite + Pinia), `apps/api` (Laravel 13 + Sanctum), `packages/engine` (TS render engine), `packages/formats` (stub).
- `packages/engine`: RenderBuffer, Matrix model geometry (Vertical/Top Left/zigzag), On effect — golden-frame Vitest suite proves the harness.
- `apps/api`: Sanctum SPA cookie auth (register/login/logout/me), project CRUD scoped to owner, Postgres + jsonb, PHPUnit feature tests.
- `apps/web`: auth + projects + empty layout page, Pinia stores, COOP/COEP headers verified (`crossOriginIsolated === true`) in local dev.
- Verified end-to-end locally: register → create project → land on empty layout page, survives reload (session + DB persistence).
- CI: GitHub Actions (lint/typecheck/vitest for Node workspaces, PHPUnit + a real-Postgres migration check for the API).
- Docker: multi-stage Dockerfile (Vue build + Laravel, nginx+php-fpm via supervisord) builds locally; `render.yaml` blueprint written (web + worker + Postgres).
- Smoke-tested the built image directly (register → create project → list projects → SPA static serve, all through nginx+php-fpm) — full request path works outside of `php artisan serve`/Vite dev.
- Deployed: GitHub repo pushed, Render Postgres + web service + worker provisioned via the Render API, migrations run as a one-off job. Verified the full loop live in-browser on the Render URL: register → create project → land on empty layout page, `crossOriginIsolated === true`.
- R2 bucket not yet created (credentials on hand were bucket-scoped, not account-scoped) — deferred to M2, the first milestone that needs file upload.

# DECISIONS.md

Locked technical decisions (goal prompt §4). Do not relitigate without recording a deviation here with one line of why.

| Area | Decision |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Pinia |
| Timeline grid | Custom canvas, virtualized rows — no DOM timeline/grid libraries |
| House preview | Three.js — THREE.Points for pixel nodes, InstancedMesh for 3D bulbs later |
| Effect engine | TypeScript, CPU-first, Web Worker pool sized by `navigator.hardwareConcurrency`, SharedArrayBuffer frame store, OPFS spill >300MB, seeded RNG (mulberry32) |
| Isolation | COOP: same-origin + COEP: require-corp from day 1 |
| Backend | PHP 8.3 + Laravel 12 in Docker on Render (nginx + php-fpm) |
| DB | Managed Postgres on Render (Basic-1GB to start), jsonb for open-ended params |
| Auth | Laravel Sanctum, email+password first |
| Object storage | Cloudflare R2 (S3-compatible), presigned direct browser upload/download |
| Queues | Laravel queue worker as separate Render Background Worker |
| Websockets | Laravel Reverb, own Render service, not before M7 |
| fseq writer | Browser-side. v2 uncompressed + zlib (native CompressionStream) first, zstd-wasm next |
| Audio | Native AudioContext.decodeAudioData; ffmpeg.wasm only as last-resort fallback, never in base bundle |
| Live lights output | None from browser/cloud in phase 1 (fseq download only). Phase 2 (M8) = direct browser→FPP HTTP upload on LAN (Chromium LNA). Bridge daemon = post-v1. |
| Hosting shape | 3 Render services (web Docker, worker Docker, Reverb later) + Postgres + R2 |

## Deployed infrastructure (M0)

- GitHub: https://github.com/loganjmoore/webxlights (private)
- Render Postgres: `webxlights-db` (Basic-1GB, Ohio)
- Render web service: `webxlights-web` → https://webxlights-web.onrender.com (Starter, Docker, autoDeploy on push to `main`)
- Render worker: `webxlights-worker` (Starter, `php artisan queue:work`)
- R2 bucket: not yet created — the only credentials on hand (brightprompt-hub's R2 token) turned out to be bucket-scoped, not account-scoped, so `CreateBucket` was denied. Not a blocker for M0 (no file uploads yet); needed by M2. Needs either a fresh R2 API token with bucket-create scope, or Logan creating the bucket by hand in the Cloudflare dashboard.
- Migrations run as one-off Render Jobs after deploy (`preDeployCommand` isn't exposed by the public Render API for docker services, only via the dashboard/Blueprint sync) — `render.yaml` still declares it for whenever the project switches to Blueprint-based deploys.

## M1 simplifications (documented ceilings, not silent gaps)

- Matrix geometry: Vertical / Top Left / zigzag-on / strandsPerString=1 only. Horizontal, other starting corners, Don't Zig Zag, Alternate Nodes, Strands/String > 1 are unimplemented — add when a real imported model needs them.
- Arches/Star/Circle: non-layered / single-ring only. Layered Arches, multi-layer Star (Layer Sizes, Inner Layer %) deferred.
- Custom model: plain `CustomModel` grid format only; the compressed `CustomModelCompressed` variant (`node,row,col[,layer];...`) is unimplemented.
- Screen placement on import uses `WorldPosX/Y` (+`ScaleX` for Boxed types) only — gives correct *relative* positions between models but not exact per-type rotation/shear (3pt Angle/Shear/Height, 2pt X2/Y2 endpoints).
- Layout canvas is read-only render for M1 — no drag-to-reposition, no background photo underlay (needs R2, deferred to M2).

## M2 simplifications (documented ceilings, not silent gaps)

- Audio is not persisted server-side (R2 still blocked, see M0 note above). Sequences store `audio_filename` + `duration_ms` only; the browser holds the decoded `AudioBuffer` in memory for the session and prompts to re-select the file after a reload. Effect placements/timing tracks persist normally via autosave.
- Undo/redo snapshots the whole `SequenceBody` per action (capped at 100) rather than xLights' true command-pattern inverses — simpler and cheap at M2's data scale (a handful of rows/effects); revisit if per-action memory becomes real once shows have thousands of effects.
- Grid virtualization is architecturally canvas-based (satisfies the "no DOM timeline libs" decision) but not yet optimized for the M9 perf budget (100 visible rows / 5k effects) — it draws every row every frame, fine at M2's scale.
- Only the "On" effect has a param schema (`EFFECT_SCHEMAS`) since it's the only effect implemented so far; the palette will grow with M3/M6.
- Timing tracks support manual marks only (hotkey `t`); fixed-interval/beat-bar generators are unimplemented.

## M3 simplifications (documented ceilings, not silent gaps)

Each effect implements its default/most-common render path faithfully to the SPEC math; rarer option combinations are deferred. All are cheap to extend later since the param shape is already SPEC-accurate:

- **Bars**: 8 of 14 directions (up/down/left/right/expand/compress/h-expand/h-compress). The 4 `Alternate *` (whole-bar snap) and 2 `Custom *` (static offset) directions are unimplemented.
- **Butterfly**: Style 1 only (the classic interference pattern). Styles 2-5 (other integer-math variants) and 6-10 (plasma variants) are unimplemented.
- **Fire**: Old Render Method only (fully serial, deterministic). New Render Method (frame-to-frame top-down coherent flame), Grow-with-music, and Location remap (Top/Left/Right) are unimplemented — always renders Bottom-anchored.
- **Meteors**: Effect=Down only. Up/Left/Right/Implode/Explode/Icicles(+bkg) are unimplemented. The frame-time-based speed accumulator is simplified to a flat per-frame step (no `frameTimeMs` in `FrameContext` yet).
- **SingleStrand**: Chase tab only, single chase (Number Chases=1), Left-Right direction, Palette color scheme, Fade=None. The Skips and FX (WS2812FX) tabs are entirely unimplemented, as are Mirror/Dual/Static/Bounce chase types.
- **Snowflakes**: Type=1 (single pixel) + Falling mode only. Shapes 0/2-9 (plus/diamond/cluster/etc) and Driving/Accumulating modes are unimplemented.
- **Spirals**: core arm/thickness/rotation/Blend math is faithful; 3D shading and Grow/Shrink thickness modulation are unimplemented.
- **Twinkle**: Old Render Method, no Re-Randomize, no Strobe. New Render Method's dynamic re-placement is unimplemented.
- **Layer blending**: 10 of 24 `Layer Method` modes (Normal, Effect 1, Effect 2, Average, Additive, Subtractive, Max, Min, 1 reveals 2, 2 reveals 1) per the goal prompt's explicit M3 list. The other 14 (masks, shadow, highlight, split-screen, brightness-multiply, layered) are unimplemented.
- **No worker pool / SharedArrayBuffer frame store yet**: the engine package is pure TS with no DOM dependency (matches the "testable in Node/Vitest" ground rule) and every effect function is a plain synchronous call — it can be dropped into a Web Worker as-is. The actual worker-pool wiring, SAB frame store, and "render dirty ranges" scheduler are deferred to M4, where a live preview first makes off-main-thread rendering necessary to verify.
- **No value curves**: every VC-eligible param (marked in `EFFECT_SCHEMAS` with a `VC` badge) takes a flat value for now; the value-curve editor and per-frame VC evaluation are explicitly an M6 deliverable per the goal prompt.

## M4 simplifications (documented ceilings, not silent gaps)

- **Main thread, no worker/SAB/OffscreenCanvas**: `renderRowAtMs` runs synchronously on the UI thread on every playhead/body change. Fine at the scale exercised so far; the actual worker-pool + SharedArrayBuffer frame store from DECISIONS.md's original Effect Engine row is deferred to a perf-hardening pass — M9 is explicitly where performance budgets are gated per the goal prompt, not M4.
- **Stateful effects (Fire/Meteors/Snowflakes) replay from the effect's start on every render call** to reach the current playhead frame — correct and deterministic for scrubbing, but O(frames) per call, so a long-running stateful effect gets more expensive to preview the further into it you scrub/play. A real implementation would cache state and step forward incrementally; deferred with the worker pool.
- **No per-model mini-preview in the effect panel** (only the whole-house view). Same underlying `renderRowAtMs` call, just not wired to a second, cropped Three.js view yet.
- **No background photo underlay** (still blocked on R2, see M0/M1 notes) and **no palette editor** — every effect renders against one fixed default 2-color palette (`DEFAULT_PALETTE` in `HousePreview.vue`) until a real palette UI exists (M6/M7).
- **Layer order = row's `effects` array order**, all `Normal` blend, full opacity — matches M2's data model, which has no explicit layer index yet (see M2 notes above).

## M5 simplifications (documented ceilings, not silent gaps)

- **fseq writer is uncompressed-only** (compression type 0). zlib (via native `CompressionStream`) and zstd-wasm are the next step per DECISIONS.md's original plan — uncompressed is correct and byte-valid today, just larger on disk than a real xLights export would be.
- **Channel layout is a placeholder**: export concatenates supported models' channels in layout order, not through a real controller/universe/start-channel allocation (SPEC ch3's channel math is out of scope until controllers are modeled — display-only today per the goal prompt).
- **`.xsq` param translation covers 5 of the 10 implemented effects** (On, Bars, Color Wash, Twinkle, Spirals) — a purchased/community sequence using Fire/Meteors/Butterfly/SingleStrand/Snowflakes imports those effects with correct name and time range but schema-default params (reported in the import summary, not silently lost — matches SPEC's "unknown effects import as inert placeholder" requirement, just for a subset of *known* effect names rather than only truly-unknown ones).
- **Model mapping is exact-name-match only** — xLights' full mapping dialog (drag-to-map, Auto Map by alias/similarity, Save/Load `.xmap`) is unimplemented; unmatched model names are reported and their effects dropped.
- **No R2 archiving of exported .fseq artifacts** (still blocked, see M0/M1/M2 notes) — export is a direct browser download only, which is actually SPEC ch16's own recommended "Mitigation 1: fseq export → user uploads (always works), zero infrastructure. Ship first."
- **fseq playback on real hardware is unverified** — I have no physical FPP/xLights player to test against; verification is via round-trip parse (write → parse header → read every frame back → byte-identical) and hand-computed byte-layout checks against the SPEC's header table, not an actual light show.

## Bugs found only by actually running the UI (not caught by typecheck/lint)

- **Stale canvas height on first data load**: `SequencerGrid`'s canvas height is bound via an inline `style` derived from `rows.length`, and its `watch(..., draw)` read `getBoundingClientRect()` on the same tick rows went from empty to populated — Vue's default pre-flush timing meant `draw()` ran *before* the DOM's new inline height was applied, so the grid rendered at 0px height (invisible) the first time real data arrived. Fixed with `{ flush: "post" }`. Same risk applies to any canvas component that both derives its own size from reactive data *and* redraws on that data changing.
- **`structuredClone()` throws on Pinia-reactive objects**: the sequencer store's undo/copy/paste helpers called `structuredClone()` directly on `body.value` (a Vue reactive Proxy), which throws `DataCloneError: could not be cloned` in Chrome. Because `pushUndoSnapshot()` runs *before* the actual mutation in every store action, this silently aborted every single effect placement/move/resize/delete — the UI looked completely inert (arm an effect, drag, nothing happens) with no visible error unless you were watching the console. Fixed by cloning via `JSON.parse(JSON.stringify(...))` instead, which reads through the proxy fine for our plain-JSON `SequenceBody` shape. General lesson: never call `structuredClone()` directly on a Pinia/Vue reactive ref's value — unwrap with `toRaw()` or JSON round-trip first.

## Deviation log

- 2026-08-10: `composer create-project laravel/laravel` installs Laravel 13.x (goal prompt said "12.x-ish LTS"). Laravel 12 is not what `laravel/laravel` resolves to as of this date; using current stable 13 instead of pinning back to an EOL-adjacent 12.
- 2026-08-10: `render.yaml`'s Postgres connection env var is named `DB_URL`, not `DATABASE_URL`. `config/database.php`'s pgsql connection reads `env('DB_URL')` — using Render's own `DATABASE_URL` convention there silently falls back to `DB_DATABASE` default `laravel` on `127.0.0.1:5432` and fails at migrate time with a misleading "connection refused" instead of a config error.
- 2026-08-10: PHP 8.4, not 8.3 (goal prompt §4 locked 8.3). Laravel 13's Symfony 8.x dependency tree requires PHP >=8.4.1 (`symfony/console`, `http-kernel`, etc.) — confirmed via `composer why-not php 8.3` and a failed container boot on `php:8.3-fpm-alpine`. `composer.json` and the Dockerfile base image both bumped to 8.4.

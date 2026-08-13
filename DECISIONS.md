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
- **No background photo underlay** (still blocked on R2, see M0/M1 notes). A per-effect palette editor shipped in M15.3 (below) — every effect can now carry its own Color override instead of always using the fixed app-wide default.
- **Layer order = row's `effects` array order**, all `Normal` blend, full opacity — matches M2's data model, which has no explicit layer index yet (see M2 notes above).

## M5 simplifications (documented ceilings, not silent gaps)

- **fseq writer is uncompressed-only** (compression type 0). zlib (via native `CompressionStream`) and zstd-wasm are the next step per DECISIONS.md's original plan — uncompressed is correct and byte-valid today, just larger on disk than a real xLights export would be.
- **Channel layout is a placeholder**: export concatenates supported models' channels in layout order, not through a real controller/universe/start-channel allocation (SPEC ch3's channel math is out of scope until controllers are modeled — display-only today per the goal prompt).
- **`.xsq` param translation covers 5 of the 10 implemented effects** (On, Bars, Color Wash, Twinkle, Spirals) — a purchased/community sequence using Fire/Meteors/Butterfly/SingleStrand/Snowflakes imports those effects with correct name and time range but schema-default params (reported in the import summary, not silently lost — matches SPEC's "unknown effects import as inert placeholder" requirement, just for a subset of *known* effect names rather than only truly-unknown ones).
- **Model mapping is exact-name-match only** — xLights' full mapping dialog (drag-to-map, Auto Map by alias/similarity, Save/Load `.xmap`) is unimplemented; unmatched model names are reported and their effects dropped.
- **No R2 archiving of exported .fseq artifacts** (still blocked, see M0/M1/M2 notes) — export is a direct browser download only, which is actually SPEC ch16's own recommended "Mitigation 1: fseq export → user uploads (always works), zero infrastructure. Ship first."
- **fseq playback on real hardware is unverified** — I have no physical FPP/xLights player to test against; verification is via round-trip parse (write → parse header → read every frame back → byte-identical) and hand-computed byte-layout checks against the SPEC's header table, not an actual light show.

## M6: scoped down from the full milestone ask (not a documented-ceiling-per-option like M1-M5)

> **Superseded.** Everything this section lists as unbuilt was completed in a follow-up pass —
> see "M6 completion" below. Kept as-is because it's the record of what shipped when, and
> because the reasoning for splitting the milestone is still the reasoning.

The goal prompt's M6 asks for 15 new effects, a full value-curve editor (Sine/Ramp/Square/Custom types, presets, point editor), a full transition system (Fade/Wipe/From Middle/Circle Explode), and VUMeter audio-reactive plumbing. That's roughly the same scope as M3 (which took a full milestone on its own). Rather than half-build all of it, this pass delivers a smaller, complete, tested slice:

- **5 new effects, not 15**: Strobe, Ripple (Old/Circle draw style only), Wave (Sine type only), Pinwheel (New Render Method only), Shockwave (no acceleration curve). Each is faithful to its SPEC render algorithm on the default/common path, same as every M3 effect. Garlands, Curtain, Plasma, Galaxy, Fan, Marquee, Pictures, Text, and VUMeter are unimplemented.
- **Value curves: one type (Ramp/linear), applied to one param** (`On.transparencyPct`) as a proof of the mechanism - `resolveParam()` in `valueCurve.ts` is generic and could be applied to any of the `valueCurve: true` params already flagged in `EFFECT_SCHEMAS`, but wiring it into all of them (plus a real curve-editor UI with presets and draggable points) is unbuilt.
- **Transitions: Fade In/Out only**, applied per-effect via an optional `transition` field on `RenderableEffect`. Wipe, From Middle, and Circle Explode are unimplemented, and there's no UI yet to set transition durations (only reachable by hand-constructing the field).
- **No VUMeter / audio-reactive effects at all** - the "per-frame FFT/level data service in the audio worker" this needs doesn't exist yet (M2's audio pipeline only does waveform peaks, not live level analysis).
- **No buffer-style / subbuffer panel work** - every effect still renders into the model's default full buffer.

## M7: scoped down from the full milestone ask (not a documented-ceiling-per-option like M1-M5)

The goal prompt's M7 asks for sequence snapshots/restore, project sharing (viewer/editor), live presence via Reverb ("locked by", avatars), a queue-job-based "Package show" zip, ETag-conflict-UI autosave hardening, and quota guards. Delivered:

- **Sequence versioning**: `sequence_versions` table (immutable snapshots, `[sequence_id, number]` unique), a "Snapshot" button and a "History" panel (creator name + timestamp, one-click "Restore" — restoring overwrites the live body and bumps `revision`, itself snapshottable afterwards so nothing is destroyed).
- **Project sharing**: `project_members` table (`role`: viewer/editor), a `Project::authorize(User, need)` helper replacing every controller's ad-hoc `owner_id === user()->id` check (`Project::accessLevel()` returns owner/editor/viewer/null) so the same rule governs projects, layouts, models, model groups, and sequences. A "Share" panel on the projects page (owner-only) invites by email of an *existing* webXLights account and sets viewer/editor; the projects list merges owned + shared-with-me. Verified end-to-end with two real accounts: owner invites editor, editor sees the project, editor can read the layout and write sequence bodies, a plain viewer is rejected on write (403).
- **ETag/optimistic-concurrency autosave**: `sequences.revision` (plain incrementing int, not a timestamp — a same-second double-save with second-precision `updated_at` would otherwise produce the same etag and silently pass a real conflict, caught by an early test failure) is returned as `etag` on every sequence response. Autosave sends `if_match`; a stale value 409s with the current server state instead of clobbering, and the sequencer UI shows a "keep mine / take theirs" banner rather than resolving it silently either way.
- **"Package show" is a client-side zip, not a queue job**: same call as M5's fseq/xsq — the goal prompt's own SPEC ch16 explicitly recommends "ship the zero-infrastructure version first," and a Render worker + R2 archive for this is pure infrastructure with no user-facing difference at this show size. The zip is a webXLights-native `manifest.json` (models/groups/sequence index) + one JSON body per sequence — *not* xLights' own rgbeffects/xsq XML (those already round-trip through the real M1/M5 importers/exporters against actual xLights files; this format's only job is "backup this project and get it back"). Verified live: exported a project with a sequence, re-imported the zip into a fresh project, and confirmed the sequence's name/frame_ms/duration_ms/audio_filename and body round-tripped exactly — satisfies the M7 accept criterion verbatim ("packaged zip re-imports cleanly into a fresh project").
- **No live presence / Reverb** — would need a new paid Render service and genuine two-session testing to be worth anything; the ETag-conflict mechanism above covers "collaborate without clobbering" (the actual M7 accept criterion) without it. Documented ceiling, not attempted.
- **No quota guards** — no usage limits exist yet anywhere in the app to enforce; nothing to guard until there's a real quota policy.
- **Audio still isn't R2-backed** (same ceiling as M2/M5) — a package export therefore can't include actual audio bytes, only the filename, same as reloading a sequence today.

## M8: FPP Connect (Chromium path)

Implemented per the goal prompt's instruction to follow SPEC ch16 §3.2 exactly, cross-referenced against ch13 §1.4/§2.1/§2.4 (the FPP HTTP API xLights itself uses) for the precise endpoint/payload shapes:

- **Detection**: `isChromiumLanCapable()` checks `navigator.userAgentData.brands` for `"Chromium"` first (covers Chrome and Edge, both Chromium-derived and both getting the Local Network Access permission), falling back to a `Chrome/` UA-string match for browsers without Client Hints support. Non-Chromium browsers (Firefox, Safari) get a guided-download message pointing at the existing M5 "Export .fseq" button instead of a broken upload UI — mixed-content blocking has no LNA-style exemption there.
- **"Discovery" is a user-entered host, not real discovery**: xLights' actual discovery sends a UDP multicast ping to `239.70.80.80:32320` and browses mDNS — neither is reachable from a browser (SPEC ch16 §3, no UDP sockets). "Connect" instead does what the SPEC's own Mitigation 2 assumes: `GET /api/system/info` against a user-typed host, both verifying it's really an FPP and surfacing HostName/Version/Mode.
- **Upload**: exactly the legacy path (SPEC ch16 §3.2's own instruction, "no custom headers beyond Content-Type" — `X-Requested-With: FPPConnect` is dropped since FPP's Apache CORS config doesn't allowlist it and the legacy POST is what passes preflight): `POST /api/file/uploads/<name>` raw octet-stream body, then `GET /api/file/move/<name>` to move it into `sequences/`. Reuses M5's `exportSequenceToFseq` unchanged — one render pipeline, two destinations (download vs. upload).
- **Playlist sync**: GET-merge-POST of `/api/playlist/<name>` matching SPEC ch13 §2.4's exact JSON byte-for-byte (`{"type":"both"|"sequence","enabled":1,"playOnce":0,"sequenceName":...,"mediaName":...,"videoOut":"--Default--","duration":<sec>}` appended to `mainPlaylist`, `playlistInfo.total_items`/`total_duration` recomputed, `random:0` preserved/created).
- **Feature flag**: a single exported `FPP_CONNECT_ENABLED` boolean gates the panel's visibility — not a config service or LaunchDarkly integration (nothing in this codebase needs one yet, and the goal prompt's own "no over-engineering" rule rules it out for a single flag). Export .fseq is a fully separate button/code path from M5, so "never block export on it" was already true by construction.
- **Verified against a mock FPP HTTP server, not real hardware** (same honesty as M5's fseq round-trip note — no physical FPP/Falcon device available): a small PHP script replicating `/api/system/info`, `/api/file/uploads/<name>`, `/api/file/move/<name>`, and `/api/playlist/<name>` exactly per the endpoint map above, with FPP's documented CORS headers. Live in-browser test: Connect → correct HostName/Version/Mode shown; Upload → the uploaded file lands in the mock's `sequences/` dir with a byte-valid PSEQ header (M5's writer, unchanged); playlist sync → the resulting JSON matches SPEC ch13 §2.4's shape exactly, including `total_duration`/`total_items` recomputed from the sequence's actual `duration_ms`.
- **Not implemented** (out of the goal prompt's explicit M8 scope): the FPP 7+ chunked PATCH upload path (SPEC notes it fails CORS preflight on FPP's current Apache config — the legacy POST path was the one asked for), config/outputs/models sync, controller discovery, MultiSync, and anything from ch16 §3.3's local bridge daemon (Phase 3, explicitly post-v1) or §3.4 cloud-side output (explicitly "never" per the SPEC's own phased recommendation).
- **A real bug found in the process, unrelated to M8 itself but caught while implementing it**: a rapid sequence of file edits during a live Vite dev session triggered a stale-HMR-module error (`does not provide an export named 'FPP_CONNECT_ENABLED'`) that crashed the whole SPA in the browser tab that had the error cached. Restarting the Vite dev server (`rm -rf node_modules/.vite`) and testing in a fresh tab confirmed the actual code was correct — this was a dev-server cache artifact, not a shipped bug, but worth noting: don't trust a browser tab's console history across a live-edit session without confirming in a fresh tab first.

## M9: Hardening + parity harness + docs (reduced scope)

The goal prompt's M9 asks for a perf pass against the ROADMAP budgets, OPFS spill for >300MB shows, error triage, an onboarding sample project, user docs, and PARITY.md. Delivered:

- **A real O(n²) → O(n) perf bug, found by actually writing the perf test**: `renderRowAtMs` (M4) replays every stateful effect (Fire/Meteors/Snowflakes/Strobe) from its start on every call - correct for one-off scrubbing queries, but M5's fseq export calls it once per frame in a straight loop, so frame *k* silently redid frames `0..(k-1)` internally. A full-length sequence with a stateful effect would have been minutes-to-unusable, not the 60s budget. Fixed with `createRowSequencer()` in `packages/engine/src/renderFrame.ts`: one sequencer per row, called in strictly increasing frame order, carrying each stateful effect's own `State` object across calls instead of recreating it - the state (not the scratch `RenderBuffer`) is where the physics persists, so this produces byte-identical output to the old replay loop, just without redoing prior frames (`test/rowSequencer.test.ts` asserts exact equality against `renderRowAtMs` frame-by-frame). Wired into `apps/web/src/lib/fseqExport.ts`, replacing the old per-frame `renderRowAtMs` call. `test/perf.test.ts` renders the ROADMAP's medium-show benchmark (~20k channels, 3600 frames, a mixed stateless+stateful layer stack) as a permanent regression guard: **~6.2s, well inside the 60s budget** (measured on this dev machine; treat as directional, not a hardware-normalized SLA).
- **Grid virtualization** (the M2/M9-tracked item): `SequencerGrid.vue`'s canvas used to be sized to *every* row (`rows.length * ROW_HEIGHT`) and redraw all of them every frame regardless of scroll position. Now a fixed-height (`420px`) canvas sits inside a scrollable wrapper with a spacer div for real scroll range; `draw()` only iterates rows in `[scrollTop, scrollTop+viewport]`, so cost is flat regardless of total row count (the 100-row/5k-effect budget). Verified live: created a 25-model test project, scrolled the grid, and placed an effect on a row visible only after scrolling — landed on the correct row (hit-testing correctly accounts for the scroll offset).
- **Error triage**: `apps/web/src/lib/errorTriage.ts` installs a `window.onerror`/`unhandledrejection` handler plus a Vue `app.config.errorHandler`, all funneling into a last-resort DOM-level banner (not a Vue component, so it still works if Vue's own runtime is what broke) offering a reload. Before this, an uncaught error left the page silently frozen or blank with nothing but a console line.
- **Onboarding sample project**: `apps/web/src/lib/demoProject.ts`'s `createSampleProject()` builds a project with a small layout (a 16×16 Matrix + an Arch), a pre-built sequence (Color Wash + Twinkle already placed, a few timing marks), and a **synthesized** ~10s audio jingle (plain-math sine arpeggio, WAV-encoded client-side - not a real licensed song; the goal prompt's "royalty-free song" isn't sourced/bundled in this pass, and since audio still isn't R2-backed, a synthesized clip needs zero new infrastructure while a bundled file would need some). A "Load sample project" button appears on the empty-state projects page; clicking it lands straight in the sequencer with audio already loaded (no manual re-select) and effects already visible on the live preview. Verified live end-to-end with a fresh signup: signup → Load sample project → sequencer loads with waveform + rendered preview → Export .fseq, no manual file handling at any step - the actual M9 accept criterion.
- **Docs**: `/docs` (`DocsPage.vue`, no auth required) has an import guide (hand-written) and an effect reference generated **from `EFFECT_SCHEMAS`** (iterates the same registry the props panel binds to, so it can't drift out of sync with what's actually placeable) — linked from the projects page.
- **PARITY.md**: a feature-by-feature table (models, sequencer, effects, formats, sharing, FPP output, everything else) against SPEC chapters, built from this file's own milestone-by-milestone ceiling notes rather than a fresh audit — those notes are the ground truth of what's actually implemented.
- **Not attempted, documented as real gaps, not silently skipped**:
  - **OPFS spill (>300MB shows)**: no show in this project has come close to that size (sequence bodies are small JSON; audio is decoded in-memory only, per the M2 ceiling), so there's nothing real to spill yet and no way to test a spill mechanism honestly without one. Building the plumbing unexercised would be exactly the kind of premature abstraction the goal prompt's own "no over-engineering" rule warns against.
  - **Worker pool + SharedArrayBuffer frame store** (the M3/M4-tracked item): the perf test above shows single-threaded rendering is well inside budget at the tested scale; moving it off the main thread would reduce UI jank during heavy computation but not total work, and is a genuinely large architectural undertaking (OffscreenCanvas, a worker-pool message protocol, SAB frame store) that this pass didn't have room for alongside everything else M9 asked for. Real deferred scope, not a documented ceiling on a single option.
  - **Determinism/parity harness against real `xLights --headless`**: needs an actual xLights install in CI, unavailable in this environment. Building the harness's plumbing without ever running it against real xLights output wouldn't prove anything - see PARITY.md's own note on this.
  - **Peaks-in-a-worker**: the M2 code comment flagging this as an M9 item is now stale in spirit - the SPEC's own bar ("<1s for a 5-minute song") is already met on the main thread per that same comment, so moving it to a worker has no measured benefit today. Left as-is rather than doing speculative work.

## M10: Sequencer interaction parity

Delivered exactly the scope in `NEXT-MILESTONES.md`: timing marks rendered on a pinned ruler row, left-edge resize, snap-to-mark, a right-click context menu (copy/cut/paste/duplicate/delete + mark add/delete), plus the two real bugs sitting in the same code (broken horizontal zoom/scroll, undo snapshotting per pointermove during a drag).

- **Effect-type glyphs on effect bars** (the reference screenshots' sparkle/photo/emoji/chart icons) — not implemented. Stated in `NEXT-MILESTONES.md` as visual parity, not interaction parity; a separate follow-up.
- **Multi-select/multi-drag** — not implemented. Touches selection state, undo-snapshotting, and hit-testing all at once for a workflow the reference screenshots don't show; single-effect move/resize plus the new left handle covers what was asked.
- **Multi-track timing UI (add/rename/delete track)** — not implemented. `body.timingTracks` today holds one auto-created "Marks" track; this milestone renders what's already stored, it doesn't add track management UI (M2's own ceiling note already said "manual marks only, singular track").

## M11: Controllers

Delivered exactly the scope in `NEXT-MILESTONES.md`: a real `controllers` table and CRUD, a Controllers page, per-model controller assignment, and an `.fseq` export rewrite through real controller channel allocation. DDP first, per the spec's own reasoning (no 512-channel-per-universe ceiling, one controller = one flat channel span; 5 of 6 controllers in the reference screenshot are DDP; E1.31 would roughly double this milestone's complexity for a feature with zero live-output consumer yet).

- **`channel_count` is computed client-side, not server-derived.** The geometry engine (`computeGeometryFromAttrs`, node counting) lives entirely in `packages/engine` (TypeScript, no PHP port). The model-assignment UI computes a model's channel byte count the same way `fseqExport.ts` always has and submits it with the assignment; `ModelEntityController::update` enforces `offset + channel_count <= controller.channel_count` arithmetically using whatever was submitted (or the model's last-known stored value), not by re-deriving node geometry itself. A malicious or buggy client could submit a wrong `channel_count`, but the constraint check itself is real and server-side — porting the geometry engine to PHP for one validation check would be a large, unrequested undertaking.
- **E1.31/Art-Net universe math** — not implemented. Deferred as a set with DDP-first above; Start Universe/Universe Count/Channels-per-Universe and every field that only matters once real network output exists (Monitor, Suppress Duplicate Frames, Multicast, FPP Proxy IP, Priority, Managed, the global-settings block, Discover/Upload Input-Output/Open Proxy) are decorative without it.
- **`xlights_networks.xml` import** — not implemented. No parser exists for this file in `packages/formats` (only `fseq.ts`/`rgbeffects.ts`/`xsq.ts`); manual entry (what the reference screenshot shows being done anyway) unblocks the export win without new parser scope.
- **No `order` column on controllers** — nothing in this milestone's UI sets or reads one; channel allocation is keyed by `start_channel`, not creation order. Add it back only when a real reorder UI is asked for.
- **Hit the `ControllerController`/`App\Models\Controller` base-class collision trap twice, not once.** Aliased it correctly in `ControllerController.php` (`use App\Models\Controller as ControllerModel`) from the start, per the known trap - but adding the same unaliased `use App\Models\Controller;` import to `ModelEntityController.php` (for the assignment validation check) silently shadowed *that* file's own bare `Controller` extends clause too, since a `use` import overrides PHP's default same-namespace class resolution for the rest of the file. Surfaced as a fatal "must be compatible with Model::update()" error, not a clean exception. General lesson: the trap isn't scoped to one file - any file that both extends the bare `Controller` (implicit same-namespace resolution) and imports `App\Models\Controller` needs the alias, not just the one HTTP controller built for this feature.

## M12: Layout editing, 2D first then 3D

Delivered exactly the scope in `NEXT-MILESTONES.md`: 2D drag-to-reposition first (proving `api.updateModel()`, which had zero callers anywhere in the app before this), then `screen.z` and a 3D editing mode.

- **`HousePreview.vue`'s rendering stays flat, untextured `THREE.Points`** - the reference screenshots' real Santa/reindeer face textures on cone geometry are a rendering-*fidelity* gap, not a layout-*editing* gap this milestone touches. `LayoutCanvas3D.vue` reuses the same flat-points display approach for consistency; texturing either would be a separate, much larger undertaking (UV mapping, per-model mesh geometry instead of a point cloud).
- **Mesh/GDTF 3D objects, per-preview cameras** - unchanged ROADMAP non-goals, not reversed by M12 (M12 only reverses the "no 3D editing" non-goal, not the broader 3D-rendering-fidelity ones).
- **Rotate/shear via a 3D gizmo** - not implemented. `DragControls` (the M12 MVP) only translates; a full `TransformControls` gizmo with per-axis rotate/scale handles is a legitimate fast-follow once translate is proven out, not this pass's job. The numeric Scale/Rotate fields in the position panel remain the only way to change those in 3D.
- **Multi-select / multi-drag** - not implemented, consistent with the same cut in M10.
- **`screen.rotate` is captured on import and stored but rendered by neither the 2D canvas nor `HousePreview.vue`** - a pre-existing gap this milestone inherits, not introduces. Known, not blocking.
- **2D's canvas flips Y for a top-left screen origin; `LayoutCanvas3D.vue` does not flip Y** (Three.js is Y-up, and the raw imported `WorldPosY` convention is used directly, matching `HousePreview.vue`'s existing approach). The two views intentionally use different vertical conventions for their own coordinate systems - both still read the same underlying `screen.y` value from the model record.
- **`bulkUpsert` overwrites `screen` wholesale on every re-import** (pre-existing, not new) - re-importing an `xlights_rgbeffects.xml` after a hand-edited 3D position clobbers it back to the file's `WorldPos*` values. Worth knowing, not blocking.

## M13: Layout visual parity + model placement toolbar

Delivered exactly the scope in `GOAL-M13.md` (which also documents its own five adversarial
review passes and one correction found only by live screenshotting, per this repo's standing
discipline). Written from the official xLights manual, not from Logan's own reference
screenshots — none were available this session, unlike M10-M12's six. Stated as a lower-
confidence source in the goal doc itself.

- **Custom model type excluded from the drag-create palette** - `parseCustomModelGrid` needs a
  real `CustomModel` attribute string; `raw_attrs: {}` would make a dropped Custom model
  geometry-less forever, reading as a bug rather than a placeholder. Real xLights uses a
  dedicated grid editor for Custom models - a separate, much larger feature, not faked here.
- **Drag-to-place uses fixed engine defaults, not real xLights' drag-to-size gesture** - the
  actual product lets the initial drag define a matrix's width/height, an arch's span, etc.
  live. This milestone drops at `computeGeometryFromAttrs`'s fallback defaults; resizing is
  only what the existing X/Y/Z/Scale/Rotate panel already exposes, not per-type structural
  params (string count, node count, degrees). A real fidelity gap, not a rounding error.
- **No per-type structural-param editor** - follows from the cut above. Would be its own real
  feature (a form driven by each type's attribute schema, analogous to `EFFECT_SCHEMAS` for
  effects but for model geometry). Out of scope for this pass.
- **Palette is 2D-only** - creating directly into the 3D view would need ground-plane
  raycasting from a native HTML5 drag event, a materially different mechanism from the 2D
  canvas-transform inversion this milestone reuses. Models created in 2D are immediately
  editable in 3D via the existing M12 path.
- **No icon artwork** - palette buttons are text-labeled. This repo has no icon asset pipeline,
  and the reference source (the manual, not screenshots this time) couldn't verify exact icon
  art anyway.
- **Only `LayoutPage.vue`'s own chrome got the dark-theme pass** - `AuthPage.vue`/
  `ProjectsPage.vue` and the rest of the app keep the inherited Vite-template light theme.
  Comparing against xLights' *Layout* tab specifically didn't require touching pages that have
  no xLights-tab equivalent; no evidence was gathered about them either way.
- **A real, pre-existing geometry bug, not introduced by this milestone**: `computeTree`'s cone
  radius formula had the bottom/top ratio inverted (present since M1). Found only by looking at
  a live-rendered Tree, not by reading the code - it reads as plausible in isolation ("top
  radius 1, bottom wider" the comment says, while the formula did the opposite). Fixed
  one-line; confirmed via pixel-column measurement of the actual rendered output, since a
  thumbnail-scale "Round" tree's wrap-around wobble is genuinely easy to misread by eye alone.
- **This session had no working Docker daemon** (`/var/run/docker.sock` absent) - the
  documented `docker compose up -d postgres` dev flow doesn't run here. Verification used a
  throwaway sqlite `apps/api/.env` (gitignored, never committed) instead; Postgres remains the
  real/deployed database per this file's locked stack, unchanged.

## M14: Model rendering + import fidelity audit

Not a scoped feature - a direct response to "ensure every model type looks like it should,
ensure imported layouts perfectly match." No goal-prompt/adversarial-review ceremony for this
one (that process was specific to M13's original ask); this is a bug-fixing/verification pass,
verified rigorously instead.

- **`ModelGeometry.width`/`.height` were being used as a screen bounding box** - they're buffer
  (row/col) dimensions for effect rendering, unrelated to on-screen size for any type whose
  `screenX/screenY` isn't literally `bufX/bufY`. New `geometryScreenBounds`
  (`packages/engine/src/models/bounds.ts`) derives the real box from the nodes themselves.
  Circle/Star/Wreath were rendering as a barely-visible speck next to a Tree before this -
  confirmed by screenshot, not assumed.
- **Real xLights' `WorldPosX/Y` is a model's center, not its raw local origin** - confirmed
  against the manual/community docs (searched, not assumed), since no reference file with known
  WorldPos/RotateZ/Scale values and a known-correct render was available to verify against
  directly. Every asymmetric model type (Icicles, Window Frame, Arches, Candy Canes) needed
  re-centering onto that anchor; `packages/engine/src/models/transform.ts` is the one shared
  definition 2D and 3D both render through now, specifically so they can't quietly diverge the
  way this codebase's own pre-existing 2D/3D Y-flip convention already does (see M12's note).
- **Rotation's sign convention is stated, not verified against real xLights.** Implemented as
  standard counter-clockwise-positive in a Y-up system, consistent between 2D and 3D by
  construction (one shared `nodeWorldOffset`) - but nothing in this session confirms that
  matches real xLights' own `RotateZ` handedness. A real, honestly-flagged fidelity gap if it
  turns out backwards, not a silent guess.
- **Per-type shear still not applied** - Angle/Shear/Height for the 3-point line placement
  system, X2/Y2 endpoints for 2-point. These are placement-system-specific attributes on top of
  the universal Pos/Scale/RotateZ trio every model now gets; a real remaining gap, same
  category as M12's original "not exact rotation/shear" note in `PARITY.md`, now half-closed
  instead of fully closed.
- **Found a real regression in this milestone's own work before shipping it**: the bounds
  refactor above initially omitted the `NODE_SPACING` factor `draw()` applies when placing
  nodes, a ~4x unit mismatch between what auto-fit/hit-testing thought a model's size was and
  what actually got drawn. Every screenshot taken after introducing this bug still looked
  correct, because the multi-model fixtures used for visual verification had inter-model
  spacing large enough to dominate the computed auto-fit extent regardless of any single
  model's own (wrong) size - the bug was invisible to "does the screenshot look right" and only
  surfaced when an actual canvas click (at a real, sampled-from-the-live-canvas pixel, not a
  guessed coordinate) failed to select anything, including a dead-center click on the single
  largest model on the canvas. General lesson, worth stating plainly: a refactor to bounds/
  hit-testing code needs its own interaction test, not just a visual re-screenshot of the
  rendering it also happens to feed - the two can drift independently and only one of them
  shows up in a static image.
- Candy Canes' hook radius (hardcoded `0.5`, unreadable at any real pole length) and Icicles'
  no-`DropPattern` default (one drop spanning the whole budget, i.e. a straight line) were both
  real, pre-existing cosmetic defects unrelated to the bounds/transform work above - found by
  the same "actually look at every type" pass, fixed independently.

## M15.7: view_objects import + Gridlines rendering

Prompted by revisiting a finding from earlier this session (M15.1): while investigating whether
`<view_object>` elements (Gridlines, Mesh) were real bugs or correctly out of scope, the
conclusion then was "not a model, correctly excluded from model import" - true, but incomplete.
`<view_objects>` is a real, separate xLights XML element, and `parseRgbEffectsXml` never looked
at it at all - every real show's Gridlines/Mesh/Terrain helpers were silently dropped, not
"correctly excluded," just never read. Opening real xLights' Layout tab's "3D Objects" sub-tab
confirmed this is real, commonly-populated data (the same real show has both a Gridlines and a
Mesh object).

- **New `view_objects` table/model/controller, structurally mirroring `models`**: `type`
  (DisplayAs), `supported`, `raw_attrs` (lossless). Import-only for now (`bulkUpsert` by name),
  no manual create/edit UI - same reasoning M15.5's `ViewObjectController` comment gives: there's
  no real user workflow for hand-authoring a Gridlines helper the way there is for models/groups.
- **`SUPPORTED_VIEW_OBJECT_TYPES = ["Gridlines"]` only.** Mesh/Terrain need an OBJ-mesh loader or
  heightmap renderer this codebase has never had any of; Ruler/Image/Controller are lower-value
  and also unbuilt. Gridlines is the one type that's both commonly present and genuinely simple
  to render (a set of evenly-spaced lines) - importing the rest as `supported: false` (kept,
  not silently lost) rather than skipping `<view_objects>` selectively keeps the same "nothing
  imported is silently invisible" convention every other supported/unsupported list in this
  codebase already follows.
- **2D and 3D each get their own honest interpretation of Gridlines, not a shared one.** The 2D
  canvas (`LayoutCanvas.vue`) already only ever draws the WorldX/WorldY plane for every model -
  Z and 3D rotation aren't representable there at all (see `transformFor`'s RotateZ-only
  comment). Reproducing Gridlines' real RotateX/Y/Z ground-plane rotation in a 2D canvas would be
  fabricating precision the surface can't actually show; drawing it flat in the same X/Y plane
  every model already uses is the consistent, honest choice. `LayoutCanvas3D.vue` (Three.js) has
  no such limitation and applies the real WorldPos + RotateX/Y/Z verbatim.
- **Custom line-segment mesh instead of `THREE.GridHelper`** in 3D: `GridHelper` is square-only
  (one `size` argument), but xLights' Grid Width/Height are independent (this real show's is
  2500×2000, not square) - using `GridHelper` and silently rounding to a square would misrepresent
  the real dimensions. A manual `LineSegments` geometry respects both axes exactly.
- **Respects the real "Active" checkbox** (`raw_attrs.Active === "0"` skips rendering in both
  canvases) - real xLights' own Layout tab showed this real show's Gridlines set inactive by the
  user, and honoring that rather than always showing an imported grid is the faithful behavior.
- Verified live against the real 120-model show: re-imported and confirmed via direct DB query
  both real view objects landed correctly (`Gridlines` type=Gridlines supported=true with real
  `GridWidth=2500`; `Mesh` type=Mesh supported=false) and the unsupported-types import banner
  now correctly lists "Mesh" alongside the pre-existing DmxServo/DmxGeneral/Cube. Temporarily
  flipped `Active` to `"1"` via direct DB update to confirm the renderer actually works (real
  imported data had it off, matching real xLights) - both the 2D flat grid and the 3D rotated
  ground-plane grid rendered correctly at the real 2500×2000/50-spacing dimensions, then
  restored to the real `Active: "0"` value afterward.

## M15.6: Timing track generators (fixed-interval, Metronome)

Prompted by opening real xLights' Sequence Settings > Timings tab and its "New Timing" dialog -
`PARITY.md` already flagged "manual marks only, no fixed-interval/beat-bar generators" as a gap;
this closes exactly that, scoped to what's honestly achievable without a larger rendering change.

- **Full multi-row timing tracks were explicitly out of scope for this pass.** Real xLights
  renders each named track (Structure, Lyrics 1, Beats, ...) as its own row with its own marks
  and its own delete control. `SequencerGrid.vue` currently flattens every track into one merged
  pinned ruler (`allMarks()` = `timingTracks.flatMap(t => t.marks)`) and hardcodes `trackIndex: 0`
  in every click-hit-test - genuinely unrelated to the generator gap and a much larger rendering
  rearchitecture. Building the generator on top of that limitation rather than blocking on fixing
  it first was the right call: it's additive, doesn't make the existing limitation worse, and is
  independently useful even before multi-row rendering exists.
- **Ported only the fixed-interval and Metronome (BPM) options from real xLights' 8-option New
  Timing dropdown** (Empty, 25ms, 50ms, 100ms, Metronome, Metronome w/ Tags, FPP Commands, FPP
  Effects) - the other four either need data this codebase doesn't have (FPP Commands/Effects are
  FPP-specific bindings, Metronome w/ Tags stores extra tag metadata) or add nothing over Empty
  (an empty track is just `ensureDefaultTimingTrack`, already the existing behavior).
- **A real bug found during live verification, fixed before shipping**: the first implementation
  took a `trackIndex` and overwrote `timingTracks[trackIndex]`'s marks, defaulting to index 0.
  Verified live against the real jinglebells sequence and found `timingTracks[0]` is "Beats" (a
  real, meaningfully-named imported track with 242 real marks) - not a generic placeholder. The
  generator would have silently destroyed real imported timing data. Fixed by always pushing a
  *new* named track (auto-named from the generator settings, e.g. "50ms" or "Metronome
  120bpm", de-duplicated against existing names) instead of targeting an index - matches what
  real xLights' own New Timing dialog does (it always adds a track, never overwrites one).
- Verified live against the real jinglebells sequence (120707ms duration): generated a 50ms
  fixed-interval track, confirmed via direct DB query it added a new "50ms" track with 2415 marks
  (120707/50 ≈ 2415) while all 5 real imported tracks (Beats, Note Onsets, Mark,
  JingleBellsFrankSinatra, Backup) were untouched. Generated a 120bpm Metronome track separately
  and confirmed the 500ms (60000/120) interval.

## M15.5: Model Groups editor (Layout page)

Prompted by another real-xLights-vs-webXLights side-by-side pass, this time on the Controllers
tab and the Layout tab's Groups list. Controllers turned out already appropriately scoped -
real xLights' extra fields (Description, Auto Size, Monitor, Multicast, FPP Proxy IP, Priority,
Managed) all relate to live network output, a documented non-goal (browsers can't open raw UDP),
so adding checkboxes for them would be exactly the "fake depth" this codebase's own standard
argues against. Model Groups was the real find: `PARITY.md` claimed `✅` for it, but the entire
feature was import-only - `bulkUpsertModelGroups` (resolves membership by model name, upserts by
group name) was the *only* way a group's row ever got written, called from nowhere but the
rgbeffects.xml importer. No create button, no rename, no membership editor, no delete - a project
built natively in webXLights (not imported from a real show) had no way to use groups at all.

- **Reused `bulkUpsertModelGroups` as the save path for both create and edit**, rather than
  building a second create/update mechanism - it already does exactly what a group editor needs
  (upsert-by-name, resolve members by name, `sync()` the pivot table), and it's exactly what the
  importer itself relies on, so the UI path and the import path share one code path with two
  entry points instead of two implementations that could drift.
- **Renaming needed a delete-then-recreate, not a plain resave**: `bulkUpsertModelGroups` matches
  on `name` (`updateOrCreate(['name' => ...], ...)`), so saving an existing group under a new
  name without deleting the old row first would create a *second* group and leave the original
  orphaned. `LayoutPage.vue`'s `saveGroup()` detects a name change against the currently-selected
  group and deletes the old row by id before the upsert - verified live (see below) that this
  produces exactly one group, not two, and the id changes but membership survives.
- **Added the one missing piece, `DELETE /layouts/{layout}/model-groups/{modelGroup}`** - the
  only genuinely new backend endpoint this pass needed.
- **Buffer style is a fixed 4-option select (Default/Single Line/Horizontal/Vertical)**, not a
  free-text field - these are the values `GroupUpsertPayload.bufferStyle` already flows through
  to `buffer_style` unchanged; real xLights has more buffer-style options for groups with 2D
  layouts (grid, etc.) that this codebase's rendering doesn't consume anywhere yet, so a wider
  picker would offer choices with no observable effect.
- Verified live against the real 120-model/11-group show: switching to the Groups tab showed all
  11 real groups with real member counts; selecting "House" loaded its real 2 members; toggling
  "DJ SIGN 1" on and saving persisted a 3rd member to the database; created and deleted a
  throwaway group end-to-end; renamed "Spiral Trees" -> "Spiral Trees Renamed" and confirmed via
  direct DB query that the old row was gone, the new one had a new id, and both original members
  (Spiral Left, Spiral Right) survived the rename.

## M15.4: Layer Blending panel (blend mode, Mix, Fade transitions)

Completes the three-panel real xLights effect-editing comparison M15.3 started: Effect Settings,
Color, and Layer Blending. This is the most surprising finding of the three - unlike Color,
**the engine-side implementation already fully existed** for all of it (10 `BlendMode`s in
`blend.ts`, the `effectMixThreshold` "Mix" concept in `layerStack.ts`, `TransitionSpec`/
`applyFadeTransition` in `transition.ts`, all since M3) - `grep`ping the whole `apps/web` tree for
any of these found zero references. Every layer was hardcoded `blendMode: "Normal" as BlendMode,
effectMixThreshold: 0` at both `LayerSpec`-construction call sites in `renderFrame.ts`, and
`RenderableEffect.transition` (already an optional field!) had no `SequenceEffect` counterpart to
populate it from - three real engine capabilities, fully tested at the unit level, completely
unreachable by any user action or import path.

- **`blendMode`/`mix` join `palette` as optional per-effect overrides on `RenderableEffect`**,
  resolved the same way (`effect.blendMode ?? "Normal"`, `effect.mix ?? 0`) at both call sites
  that build a `LayerSpec` - the exact same pattern M15.3 established, so this is additive to
  that, not a new mechanism.
- **Why blend mode is genuinely inert on a single-layer row and that's fine to ship anyway**:
  `blendPixel` composites this layer's pixel against the accumulated result of layers *below*
  it - with zero or one layer active, "below" is empty/transparent and every blend mode reduces
  to roughly the same visible result. It only does something when two effects overlap in time on
  the same row (a common real technique: a base "On" wash with a "Twinkle" layered on top in
  Additive/Max) - MAX_LAYERS is already 5, this isn't a hypothetical scenario.
- **UI labels stay in the engine's own vocabulary ("Mix"), not a borrowed real-xLights label
  ("Morph")** - the reference Layer Blending panel has both a "Morph" checkbox+slider (a
  transition mechanic, unimplemented) and, on the same effectMixThreshold value, what real
  xLights actually just calls the blend-mode-dependent threshold. Calling the UI control "Mix"
  (the engine code's own name for the field, `effectMixThreshold: number; // ... "Mix" slider`)
  avoids implying Morph support that doesn't exist.
- **Not attempted this pass**: Suppress Effect Until Frame / Freeze Effect At Frame (no such
  concept anywhere in the render engine - would be new engine work, not a UI-wiring fix like the
  rest of this pass), Wipe/From Middle/Circle Explode transition types (still Fade-only, a
  pre-existing documented ceiling), Canvas mode, and per-swatch "reflects music" toggles.
- Verified live against a real imported Pinwheel effect: set Blend Mode to Additive and Fade In
  to 500ms via the panel, confirmed both persisted through autosave to the database
  (`{"blendMode":"Additive","transition":{"inDurationMs":500}}`) alongside the M15.3 palette
  edit already on that same effect.
- New regression test (`render-frame.test.ts`): two opaque "On" layers under default Normal
  blend show only the top layer's color; the same two layers with the top one's `blendMode` set
  to `"Additive"` produce the actual additive-composited color - proves the per-effect override
  reaches `renderLayerStack`, not just that the field round-trips through storage.

## M15.3: Per-effect Color palette

Prompted by continuing the same real-xLights-vs-webXLights comparison into the Sequencer: real
xLights' effect editing is built around three panels next to the timeline - Effect Settings
(already implemented, `EFFECT_SCHEMAS`), Color (a multi-swatch palette per effect, entirely
missing), and Layer Blending (blend mode/transitions, also missing - deferred, see below). Every
webXLights effect was locked to one fixed app-wide 2-color palette regardless of what it actually
rendered, confirmed by the pre-existing `ponytail:` comments on both `HousePreview.vue` and
`fseqExport.ts` flagging exactly this ("no palette editor yet (M6/M7)").

- **`effect.palette?: RGBA[]` on `RenderableEffect`, resolved once per render call** (`const
  palette = effect.palette ?? rowPalette`) at the top of `renderStateless`/`renderStateful`/
  `renderStatefulIncremental` in `renderFrame.ts` - the three functions that already receive a
  palette argument for every effect in a row. This is a per-effect override, not a per-row one:
  real xLights' Color tab is genuinely per-effect (two Pinwheels on the same model can have
  different colors), so `RenderableEffect` carrying its own optional palette is the correct
  granularity, not a `RenderableRow`-level field.
- **Wire format is hex strings (`SequenceEffect.palette?: string[]`), converted to `RGBA[]` at
  the two render call sites** (`HousePreview.vue`, `fseqExport.ts`) via the new `hexToRgba`/
  `rgbaToHex` pair in `color.ts` - hex is what `<input type="color">` speaks natively and what's
  actually easy to eyeball in a JSON body/database row, matching how `screen`/`raw_attrs` are
  already stored as plain JSON rather than engine-internal shapes.
- **`DEFAULT_PALETTE`/`DEFAULT_PALETTE_HEX` moved into `packages/engine/src/color.ts`**, replacing
  two independent copies of the same RGBA literal array in `HousePreview.vue` and
  `fseqExport.ts` - both files needed the hex form now too (as the props panel's own fallback
  when an effect has no override), so this was the moment those two copies would have drifted
  into three; one source of truth instead.
- **Capped at 6 swatches, matching real xLights' Color tab** - not an arbitrary choice, the
  engine's own `multiColorBlend`/`twoColorBlend` already operate over an arbitrary-length
  palette array, so nothing technical caps it lower; 6 is what the reference UI offers.
- **Not attempted this pass**: per-swatch enable/disable checkboxes (real xLights lets you keep a
  6-color palette defined but only 2 active), palette presets/save-to-library, and the
  "colors reflect music" audio-reactive toggle (no audio-analysis pipeline exists yet - same
  gap VUMeter/Shader are blocked on). Layer Blending (blend mode dropdown, Fade/Wipe
  transition types beyond the existing Fade In/Out, Suppress/Freeze frame) is a distinct,
  larger panel - real xLights keeps Color and Layer Blending as separate tabs for a reason
  (different concerns: what color, vs. how this layer combines with the ones below it) - left
  for a dedicated pass rather than bolted onto this one.
- Verified live against the real jinglebells sequence: selected a real imported Pinwheel effect
  (no palette set), the panel showed the app-wide default two swatches; edited the first swatch
  to red via the panel, confirmed the change persisted through autosave to the database
  (`effect.palette: ["#ff0000", "#50a0ff"]`) and reactively round-tripped through the store.

## M15.2: Structural property editor (Layout page)

Prompted directly by comparing webXLights' Layout page against the real desktop xLights Layout
tab side by side on the same real show: real xLights has a full property grid under the model
list (Name/Type header, then every type-specific attribute - Tree's Degrees/Rotation/Spiral
Wraps/# Strings, Matrix's # Strings/Nodes-per-String, etc. - all inline-editable); webXLights only
exposed screen position/scale/rotate. The codebase's own M13 comment on `handleDelete` already
flagged this: "no other recovery path... since there's no structural-param editor yet."

- **Scoped to exactly what `computeGeometryFromAttrs` reads, not real xLights' full grid.** Real
  xLights exposes properties this engine doesn't render at all (Tree's Rotation/Spiral
  Wraps/Perspective/Alternate Nodes/Don't Zig Zag/Strand Direction, Matrix's Direction). Offering
  an input for one of those would be dishonest - it would look editable and silently do nothing.
  `packages/engine/src/models/propertySchema.ts`'s `MODEL_PROPERTY_SCHEMAS` is hand-matched
  field-for-field against `fromAttrs.ts`'s switch cases, so every exposed field has a real,
  visible effect; `property-schema.test.ts` locks the two in sync (each schema's own defaults
  must reproduce `fromAttrs.ts`'s undocumented-attrs fallback geometry exactly).
- **Lives in `packages/engine`, not `apps/web`, for the same reason `EFFECT_SCHEMAS` does**: the
  schema describes *the render engine's own contract* (which attributes this type's geometry
  function reads), not a UI concern - co-locating it with `fromAttrs.ts` is what makes the
  sync test possible at all, and keeps a future non-web consumer (e.g. a CLI) able to reuse it.
- **Backend: `raw_attrs` joins `screen` as a wholesale-replace field on `ModelEntityController::
  update`**, not a deep merge - same convention `screen` already established (M12), so the client
  always spreads the model's existing `raw_attrs` before patching in the one changed key, exactly
  like `updateScreen` already does. A geometry-affecting edit re-sends `channel_count`
  (`channelCountForModel`) alongside it when the model has a controller assigned, reusing the
  exact pattern `assignController`/`updateOffset` established in M11 - editing `# Strings` on a
  controller-routed model can't silently desync its channel span.
- **`Custom` has no schema entry.** Its one raw attribute (`CustomModel`) is xLights' own custom
  grid mini-language, not a scalar - a text input that edits it wrong corrupts the model
  silently, and a real grid editor is out of scope for this pass. Left unlisted rather than
  offered half-working.
- Verified live against the real 120-model show: selected a real Tree model (`MTL9`), the panel
  showed its real imported values (`# Strings: 16`, `Type: 0`, `Degrees: 360`, `Bottom/Top
  Ratio: 6`), edited Degrees to 270, confirmed it persisted to the database and round-tripped
  back through the reactive UI. Switching to a real Matrix model (`Garage Matrix`) correctly
  swapped to its own 2-field schema.

## M15.1: Real-file follow-up (real xLights show, local session)

M15's two biggest caveats - no reachable user xLights folder, no real xLights install to open the
export - were both artifacts of that session running remotely, not real product gaps. A local
follow-up session (this one) had both: the user's actual show at `~/Desktop/xlights` and the real
desktop xLights app on the same Mac. Full findings and fixes are in CHANGELOG.md M15.1; the
reasoning behind each fix:

- **Why the `DisplayAs` fix belongs in the parser, not the renderer**: `computeGeometryFromAttrs`
  already switches on the exact canonical strings (`"Tree"`, `"Matrix"`) and is correct to do so -
  the bug was that `parseRgbEffectsXml` handed it xLights' legacy on-disk spelling instead of the
  canonical type. Normalizing once at parse time (a small `LEGACY_DISPLAY_AS` lookup) fixes every
  downstream consumer (rendering, the unsupported-types banner, the UI type badge) instead of
  teaching each one about legacy spellings separately.
- **Why the untranslated-effect-params fix landed in `apps/web`, not `packages/formats`**: keeping
  `parseXsq`'s `{ params: {}, translated: false }` return honest (it genuinely didn't translate
  anything) preserves `packages/formats` as a dependency-free pure parser - it has no reason to
  know about the engine's effect schemas. `defaultParamsFor` already lives in `@webxlights/engine`
  and is already used by the Sequencer UI's own "add effect" path; reusing it at the one call site
  that persists imported rows keeps the layering intact (formats → nothing; web app → both formats
  and engine) instead of adding a new formats → engine dependency for one fallback.
- **Model Group export (the newly discovered, not-yet-fixed gap) is real feature work, not a
  bug-fix**: rendering a group's effect requires resolving its member models' own geometries and
  compositing per-member, in `fseqExport.ts`'s per-model render loop - a correct implementation
  needs to decide layering order against each member's *own* row effects (does a group effect
  replace, underlay, or blend with a model's individual effects?), which real xLights has explicit
  rules for that this codebase doesn't implement anywhere yet. Left for a dedicated pass rather
  than a rushed guess inside a verification session; see PARITY.md.
- **Effect row visibility is client-side (`localStorage`), not sequence data.** Considered adding
  a `hiddenRows` field to `SequenceBody` instead (server-side, syncs across collaborators/
  devices) - rejected for this pass because it would need to round-trip through `.xsq` import/
  export and "package show" without corrupting either, and because hiding a row is a workspace/
  view choice (like which panels are open), not project content. `localStorage` keyed by sequence
  ID is the lower-risk choice; revisit if multi-device/collaborator sync on this specific
  preference is actually asked for.
- **Native drag-and-drop for effects is additive, not a replacement.** Real xLights' own
  placement gesture is arm-then-drag-to-size on the grid, which this codebase already matched
  (M2). Adding native HTML5 drag-and-drop from the palette gives a second, literal "drag and
  drop" path at a fixed default duration - consistent with `ModelPalette.vue`'s convention on the
  Layout page, but a real fidelity trade (dropping doesn't let you size the effect in the same
  motion the arm-and-drag gesture does).
- **The "effect placement is broken" false alarm, and why it happened**: initial live testing
  reused a canvas bounding-box measurement taken *before* arming a palette effect, not after -
  arming reflowed the palette bar (the hint-text bug, fixed the same pass) and shifted the grid's
  actual on-screen position by ~90px, so the test's stale coordinates landed on nothing.
  Re-measuring after arming showed placement always worked. Recorded because it's the same class
  of lesson M9/M10's own DECISIONS entries already flag: a test failure needs to be diagnosed
  down to its actual cause before it's reported as a product bug, not assumed to be one.
- **App-wide dark theme was a real, load-bearing gap, not a nice-to-have.** Half the app's pages
  (`LayoutPage.vue`, `SequencerPage.vue` after M13's own fix) were dark; the other half
  (`ControllersPage.vue`, `AuthPage.vue`, `ProjectsPage.vue`, `SequencesListPage.vue`,
  `DocsPage.vue`) still had the Vite starter template's white background and 56px `<h1>`, making
  roughly half the app read as broken/unstyled rather than merely inconsistent. Fixed uniformly
  in this pass rather than continuing to fix it one page at a time as each one happened to be
  touched for an unrelated reason.

## Fix: nginx client_max_body_size (mid-M12, user-reported)

nginx's default `client_max_body_size` (1MB) 413'd real `xlights_rgbeffects.xml` imports and would have silently capped `SequenceController`'s 50MB audio upload limit well below what Laravel itself allows - a real production blocker a live user hit while this session was mid-milestone. Set to 100M in `apps/api/docker/nginx.conf`. Not caught by any existing test (local dev's `php artisan serve` has no equivalent limit) - worth remembering that nginx-layer limits are invisible to Laravel-level validation testing.

## Fix: migrations now run on deploy, not by hand (post-M15.7, user-reported production 500)

M15.7 shipped `create_view_objects_table` and, two hours later, `GET /api/v1/layouts/{id}/view-objects` was returning 500 in production for every layout - the Layout page's own load call, so the whole page came up with a "Something went wrong" banner. The code had deployed; the table had not.

**Root cause, which is older than M15.7 and would have hit the next migration too.** Nothing ever ran migrations on deploy. `render.yaml` declares `preDeployCommand: php artisan migrate --force`, but Render doesn't honor that for a Docker service created through the public API rather than a Blueprint sync - the M0 note in this file records exactly that, with migrations run as manual one-off Render Jobs instead. That made "deployed" and "migrated" two separate events that a person had to remember to pair, ten milestones running. M15.7 is simply the first one where nobody did.

- **The container migrates itself now** (`apps/api/docker/entrypoint.sh`, wired as the image's `CMD`). It prepares the persistent disk exactly as the old inline `CMD` did, runs `php artisan migrate --force`, then `exec`s supervisord. The worker service overrides `CMD` with its own `dockerCommand`, so only the single web container ever migrates - no concurrent-migration race to design around.
- **A failed migration deliberately fails the boot** (after 5 retries, which cover a database not yet accepting connections on a cold start). Render keeps the previous healthy deploy serving when a new container won't start, so the failure mode is a visibly failed deploy rather than a half-migrated app quietly 500ing on whatever the new code touches. `RUN_MIGRATIONS=false` opts a container out.
- **`preDeployCommand` stays in `render.yaml`** - it's correct if this ever moves to Blueprint-based deploys, and running migrations twice is harmless since they're idempotent.
- **The Layout page no longer dies with its helper layer.** `loadLayout()` fetched models, groups and view objects in one `Promise.all`, so a 500 on the *optional* decorative layer rejected the whole thing: no models, no groups, full-page error banner. View objects now degrade to an empty list plus a quiet inline notice. General lesson: don't put a required resource and an optional one in the same `Promise.all` unless you mean the optional one to be able to take the page down.
- **`ViewObjectController` had no tests at all** - M15.7 shipped it uncovered. `tests/Feature/ViewObjectsTest.php` now covers index, bulk upsert, upsert idempotency by name, the authorization gate, and validation. To be clear about what this does and doesn't buy: CI always migrates a fresh database, so no test could have caught an unmigrated *production* database. The entrypoint is the fix; the tests are the coverage that should have shipped with the endpoint.
- Diagnosis was confirmed rather than assumed: a brand-new account and empty layout on production returned `200 []` for models and model-groups and `500` for view-objects - same auth, same layout, no data, so the only difference was the table. Reproduced locally against sqlite (`SQLSTATE[HY000] no such table: view_objects`), then confirmed the entrypoint takes that same database from 500 to `200 []`.

## Layout editor: multi-select, resize handles, in-app confirmations, and import placement systems (user-reported)

Four things asked for together, three of them editor UX and one a real import-fidelity bug.

- **Marquee multi-select.** Dragging on empty canvas rubber-bands a selection; it selects on *intersection*, not containment, because a band clipping the edge of a large matrix should still catch it. Shift/Cmd/Ctrl adds, Cmd/Ctrl-A selects all, Escape clears, and dragging any member moves the whole selection. Selection state moved from a single `selectedModelId` to `selectedIds: number[]`, with `selectedModelId` derived as "the selection, when it's exactly one" - the property panel and the resize handles are single-model concepts and stay that way.
- **Resize handles** are computed in the model's own *unrotated* frame and drawn rotated with it. An axis-aligned box around a rotated shape makes a corner drag ambiguous ("wider" along which axis?); doing it in local space means a handle does the same thing at any RotateZ. Scale is re-derived from the shape's unscaled extents on every pointermove rather than multiplied into the current scale, which drifts over a long drag.
- **In-app confirmations** (`lib/confirm.ts` + one `ConfirmDialog` in `App.vue`) replace both `window.confirm()` calls. Native dialogs were wrong here three ways: unstyleable in a dark editor, blocking (a canvas mid-drag freezes with the pointer still captured), and *suppressed by Chrome after a few in a row* - which would silently turn "confirm before deleting" into "delete without asking". A bulk delete asks once for the whole selection, not once per model.
- **`scaleZ` is persisted and editable but has no visible effect, deliberately not faked.** `ModelNode` carries only `screenX/screenY`, so every model is planar and there is no Z extent to scale. A Z handle in the 3D view would move a number and change nothing on screen. Real per-node Z geometry (a Tree 360 actually wrapping, an arch bowing toward the viewer) is the prerequisite, and that's a model-geometry change rather than a canvas one.

### The import placement bug

**xLights does not place every model the same way**, and import treated all of them as "Boxed". Each model class picks a `ModelScreenLocation`, and the ones in play store completely different things:

| System | WorldPosX/Y/Z means | Size and angle come from | Used by |
|---|---|---|---|
| Boxed | the model's centre | `ScaleX/Y/Z`, `RotateZ` | Matrix, Tree, Star, Circle, Wreath, Window Frame, Custom |
| Two point | one **endpoint** | the `X2/Y2/Z2` offset to the other endpoint | Single Line, Icicles |
| Three point | one **endpoint** | the endpoint vector, plus `Height` as a multiple of the length | Arches, Candy Canes |

Reading a two- or three-point model as boxed puts it half its own length off-position, at default size, unrotated. Those are exactly the props a real yard is mostly made of - arches, candy canes, rooflines, icicle runs - so an imported show looked scrambled even though each model's own geometry was fine. `packages/engine/src/models/placement.ts` now derives the anchor (midpoint of the endpoints), the span (scaled so the model actually covers the endpoint vector), and the angle (`atan2` of that vector) per system.

- Placement needs the renderer's local-unit-to-world factor (`NODE_SPACING`), because xLights' endpoint vectors are a length in world units while our `scale` multiplies a local one. It's an explicit parameter rather than a constant duplicated into the engine.
- A degenerate endpoint vector (both offsets zero, which real shows do contain) falls back to the boxed reading. Scaling to a zero-length span would make the model invisible and un-clickable, which reads as "the import dropped it".
- **Not verified against a real xLights layout yet.** The repo's own fixture carries no positioning attributes at all, which is why this shipped wrong and stayed wrong. The math is unit-tested (span, angle, midpoint, Height), but confirming that an imported show *looks* like it does in xLights needs a real `xlights_rgbeffects.xml` with known positions to compare against.
- Still unimplemented, recorded rather than approximated: Poly Line's `PolyPointScreenLocation` (`NumPoints`/`PointData`) - it falls back to boxed rather than being run through two-point math that doesn't apply to it - and the three-point `Shear`/`Angle` attributes.

## Import scale: one unit convention, and what ScaleX actually multiplies (user-reported, screenshot-verified)

Placement (the previous pass) fixed *where* two- and three-point models go. Side-by-side
screenshots of the same 120-model show in real xLights and in webXLights showed the layout was
still wrong in a second, independent way: models came out at wildly different sizes and piled
on top of each other rather than spread across a yard.

Two causes, both about units.

**1. `screenX/screenY` didn't mean the same thing per model type.** Matrix, Single Line and
Icicles placed nodes one unit apart (a 50-node line is 49 units long). Circle, Star and Wreath
placed theirs on a *normalized unit circle*, so a 50-node ring and a 500-node ring were both 2
units across. Auditing every type made the spread obvious - the ratio of buffer width to local
extent ran from 1.02 (Matrix) to 26.29 (Star). `models/units.ts` now states the convention
("one local unit == the spacing between two adjacent nodes") and the ring types scale their
radius by `n / 2pi` to match it. Effect rendering is unaffected: effects address nodes through
`bufX/bufY`, and `screenX/screenY` is purely layout-space position.

**2. `ScaleX` was taken at face value.** xLights' ScaleX/Y/Z multiply the model's *render
size*, which is measured in node units - so a real show's ScaleX values are tuned against node
counts. Our renderers draw a model at `localExtent x screen.scale x unitsPerLocal`, so
importing ScaleX unchanged inflated every boxed model by exactly `unitsPerLocal` (4x) on top of
the per-type inconsistency above. Boxed placement now divides through:
`ourScale = ScaleX / unitsPerLocal`, applied independently on X and Y so a model that is wide
and short in xLights stays wide and short here.

Rendering the same synthetic yard through the old and new code makes the difference concrete:
the world bounding box went from **699 x 1840** (one model sprawling over everything, the rest
crushed into two rows - which is exactly what the reported screenshot showed) to **514 x 460**,
with each prop distinguishable. `test/yard-layout.test.ts` keeps the structural properties that
told us it was broken: a yard-shaped bounding box, no single model covering more than 60% of
the layout, distinct model centres, and two-point models spanning their declared run.
`test/placement.test.ts` adds the cross-type invariant directly - two model types with the same
ScaleX and the same node count must land within a small factor of each other, where rings used
to be ~25x too small.

**Still unverified against the real file.** These are structural fixes derived from comparing
the two screenshots and from xLights' documented scale semantics, checked with unit tests and a
synthetic yard - not from importing the user's own `xlights_rgbeffects.xml` and diffing
positions. The absolute constant relating xLights world units to ours, and per-type render-size
conventions for the odd shapes (Window Frame's buffer is an unwrapped perimeter, 132x1, so its
buffer dimensions are not a spatial box), still want a real file to pin down.

## Models get a real Z axis: a 360-degree tree is a cone, not a triangle

The remaining structural difference between the reported screenshots. In real xLights' 3D
layout a mega tree reads as a cone - you can see the strands wrap and the base is an ellipse.
In webXLights it was a solid filled triangle.

`computeTree` was already computing the cone correctly, then throwing the wrap away: the Round
style folded `sin(angle) * radius * 0.3` into `screenY` as a "slight depth cue in 2D", because
`ModelNode` had nowhere else to put it. Both 3D views then placed every node of a model at the
model's single Z, so nothing had depth and the wrap only served to smear the triangle.

- **`ModelNode.screenZ?: number`** (optional - most props really are flat against a wall or a
  lawn and leave it undefined). Tree's Round style now puts the wrap there and leaves `screenY`
  as the strand height; Flat and Ribbon are unchanged, and no other type claims depth it
  doesn't have.
- **`nodeWorldOffset` returns `{x, y, z}`** and `transformedHalfExtents` returns `halfD`, so
  depth flows through the one shared transform both canvases already use rather than each view
  inventing its own. `ScreenTransform.scaleZ` scales it; `RotateZ` deliberately doesn't touch
  it, since that rotation spins the model in its own X/Y plane.
- **`HousePreview` now uses that shared transform too.** It had been placing nodes at
  `screenX * scale` directly, which ignored per-axis scale and rotation entirely - so the
  sequencer's preview could show a show in a different shape from the layout it was built in.
- This is also what makes `scaleZ` mean something. The previous pass persisted it and said
  plainly that it had no visible effect because every model was planar; that's no longer true
  for models with real depth.

Verified by rendering a 24x30 360-degree tree top-down (X against Z): concentric rings, X span
12.0 and Z span 12.0, where before every node sat at Z=0. `test/transform.test.ts` asserts the
wrap lands on Z, that a round tree is as deep as it is wide, that a strand's height is
uncontaminated by the wrap, that flat props stay at Z=0, and that RotateZ leaves depth alone.
## M6 completion: the rest of effects wave 2, the full curve + transition systems, audio reactivity, and the 3D visualizer

M6 shipped a tested slice and documented the rest as unbuilt. This pass closes it out and takes
the 3D preview from "proof that the pipeline reaches the screen" to something you can actually
watch a show in.

- **10 more effects, 25 total** (was 15): Garlands, Curtain, Plasma, Galaxy, Fan, Marquee,
  Circles, Text, Pictures, VU Meter. Same rule as M3/M6 — the default/common render path,
  faithful to the SPEC's math, with the rarer option combinations recorded as ceilings in
  PARITY.md rather than half-built.
  - **Circles is deliberately stateless.** xLights carries circle positions frame to frame;
    here each circle's path is a closed-form function of (time, seed, index), with `reflect()`
    doing in one step what integrating a constant velocity against the walls would do frame by
    frame. That keeps it out of `STATEFUL_EFFECTS`, so scrubbing to the middle of a long
    Circles effect costs one frame's work instead of replaying every frame before it.
  - **Text rasterises through a built-in 5×7 bitmap font** (`effects/font5x7.ts`). xLights
    renders system fonts through wxWidgets; the engine package is DOM-free by decision (so it
    stays testable in Node), which rules out canvas `fillText`. At the pixel densities a real
    prop has, a 5×7 cell is about as large as a legible glyph gets anyway. No font picker, no
    outline/shadow, no multi-line layout.
  - **Pictures takes decoded RGBA rows, not a file.** Decoding happens in the browser
    (`lib/pictureImport.ts`) and the pixels travel as plain JSON in the effect's params, so an
    image round-trips through autosave/snapshots/package-show like any other param and renders
    identically in a Node test. Images are downscaled to 64px on the long edge on import —
    there's still no R2 asset store, so they ride inside the sequence body, and the ROADMAP's
    <500KB autosave budget is real.
- **Value curves: all 16 types, applied to every VC-flagged param.** The M6 version had one
  type on one param. The mechanism that made the difference is `resolveParamsAtPosition()`, a
  single pass in `renderFrame.ts` that collapses any param holding a ValueCurve into a plain
  number before the effect function runs. Effects therefore never learn that curves exist, and
  every param already marked `valueCurve: true` in `EFFECT_SCHEMAS` became curvable without
  touching 25 effect files. `ValueCurveEditor.vue` adds the shape picker, min/max, cycles and
  phase for the periodic shapes, a reverse toggle, six presets, and a click/drag/shift-click
  point editor for Custom curves, all over a live plot of the curve.
- **Transitions: 16 types, in and out.** Every non-Fade transition is an *order field* — a
  scalar per pixel saying how early it joins the reveal, shown once `order <= progress`, with a
  short soft edge. Defining them that way makes them total by construction (progress 0 reveals
  nothing, progress 1 reveals everything, whatever the shape), which is exactly what the
  "reveals monotonically, and fully, for every type" test asserts across all 16. Adding another
  is one pure function.
- **Audio reactivity is analysed offline, not tapped live.** `engine/audio.ts` runs a windowed
  radix-2 FFT over the decoded track once when it loads, producing a per-frame level plus a
  log-spaced spectrum. A live `AnalyserNode` was the obvious alternative and is the wrong one
  twice over: rendering has to be deterministic (SPEC ch10/16), and a full-sequence export runs
  far faster than real time, so there'd be no live audio to tap at export time. Analysing once
  means the 3D preview and the `.fseq` export read the same numbers by construction. The
  down-mix is to mono on purpose — analysing only channel 0 (what the waveform strip does)
  makes a hard-panned track look like it drops out.
  - With **no** track loaded, VU Meter renders nothing rather than its zero-level appearance: a
    solid bottom-of-palette wash reads as a bug, not as silence. `FrameContext.audio` is left
    undefined in that case, which is what distinguishes "no audio loaded" from "this frame of
    the song is silent".
- **The 3D visualizer is now a visualizer.** Before: a fixed camera pointed at a flat plane of
  square points. Now: orbit/zoom/pan (OrbitControls), per-model depth read from the layout's own
  `WorldPosZ`, round glow bulbs (a generated radial-gradient sprite, plus a larger additive pass
  for bloom — cheaper than an EffectComposer chain and it survives on integrated GPUs), a ground
  grid sized to the show, front/left/right/top camera presets, live node-size and glow/grid
  toggles, and an Expand mode that gives the visualizer the window.
  - **The playhead is driven by rAF while playing, not by `timeupdate`.** The `<audio>`
    element's own event fires roughly four times a second — fine for a clock readout, and the
    reason the preview stepped through a show in visible jumps. `timeupdate` is now only used
    to catch up after a seek or a pause.
  - **Colour updates are gated on the sequence's frame index**, not on the playhead: the
    preview redraws at display refresh rate but only re-renders the engine when the sequence
    actually has a new frame (every `frame_ms`), which at a 50ms frame time is a third of the
    work at 60Hz.
- **Not done in this pass** (unchanged from before, and still real): no palette editor (every
  effect still renders against the one fixed 2-colour palette, now shared by the preview and
  the export through `lib/renderSettings.ts` so they cannot drift), no buffer-style/sub-buffer
  panel, no per-model mini-preview, no group-row rendering in the preview (rows bound to a model
  group are still skipped — group buffer styles are their own piece of work), and `.xsq` param
  translation still covers the same 5 effects, so the 10 new ones import name-and-timing only.

### Verified live

Run end-to-end in a real browser against the real API (Laravel on sqlite locally, since the
Render Postgres isn't reachable from here): signup → Load sample project → sequencer. Confirmed
by driving the actual UI, not by reading the code:

- All 25 effects appear in the palette; each of the 10 new ones was placed on a real model row
  and rendered in the 3D preview at a real playhead position — Plasma as a full rainbow field,
  Garlands as stacked sagging rows, Text scrolling legible glyphs ("…RY…" of MERRY CHRISTMAS)
  on a 16-pixel-tall matrix, Circles as overlapping discs, Fan as rotating wedges, Marquee
  chasing the border, VU Meter as a single spectrum band (correct: the sample's synthesized
  audio is a pure-tone arpeggio, so exactly one band is loud).
- The value-curve editor opens from a VC button, plots the selected shape, switches type, and
  takes a click-placed point in Custom mode.
- Transition controls set an in/out duration and type, and the effect visibly reveals with them.
- Playback advances the playhead smoothly (1.42s → 2.94s across 1.5s of wall-clock) with the
  3D view updating continuously rather than in the four-per-second steps `timeupdate` gave.
- Camera presets, orbit-drag, node size, glow and grid toggles, Expand, and Export .fseq (a real
  file download) all work; zero console or page errors across the runs.

Two things this **cannot** verify here, unchanged from earlier milestones: playback on real
lighting hardware, and the Render/Postgres deployment path (the local run swaps in sqlite).

### Bugs this pass found in its own new code, caught by tests rather than by eye

- **Aliasing dressed up as animation.** Plasma advanced its phase by `position01 * speed * 2π`,
  so at any whole-number Speed the field lands on an exact period boundary at position 0.5 and
  1.0 — the "animated" plasma rendered an identical frame at those points. Speed is now plain
  radians. The same class of bug hid a real behaviour in Marquee's test: a chase reversed can
  land on the same band *phase* at a given instant, so "reverse changes the output" is only
  observable if you compare colour rather than lit/unlit.
- **A one-pixel row shear in Pictures.** Flipping the image with `floor((1 - v) * height)` puts
  the exact half-way pixel on the wrong side of the row boundary; flipping the row *index*
  (`height - 1 - floor(v * height)`) is exact. It only showed up as a wrong pixel count in the
  black-is-transparent test.
- **Curtain snapped shut on its own last frame.** `effectTimeIntervalPosition` is a sawtooth, so
  it wraps to 0 at position 1.0 — a curtain that had just finished opening slammed closed for
  one frame at the end of the effect. The final cycle now holds at 1.

## Bugs found only by actually running the UI (not caught by typecheck/lint)

- **`overflow-y: auto` with no explicit `overflow-x` silently computes `overflow-x` to `auto` too**: `SequencerGrid.vue`'s `.grid-scroll-viewport` needed vertical scroll only (the canvas handles its own horizontal sizing, scrolled by the page's outer `.h-scroll` wrapper) — but per the CSS Overflow spec, when one of `overflow-x`/`overflow-y` is non-`visible` and the other is left at the `visible` default, the `visible` one computes to `auto` too. This turned `.grid-scroll-viewport` into a second, narrower horizontal scroll container that silently clipped the widened (post-M10) canvas to its own ~880px box, before the outer wrapper's scroll ever got a chance to reveal the rest — invisible in code review (the CSS reads correctly as "vertical scroll only"), only caught by actually zooming in and scrolling in a live browser and finding effects that `getImageData` proved were drawn but weren't on screen. Fixed with an explicit `overflow-x: visible`. General lesson: never set only one of `overflow-x`/`overflow-y` without deciding what the other one should compute to.

- **Stale canvas height on first data load**: `SequencerGrid`'s canvas height is bound via an inline `style` derived from `rows.length`, and its `watch(..., draw)` read `getBoundingClientRect()` on the same tick rows went from empty to populated — Vue's default pre-flush timing meant `draw()` ran *before* the DOM's new inline height was applied, so the grid rendered at 0px height (invisible) the first time real data arrived. Fixed with `{ flush: "post" }`. Same risk applies to any canvas component that both derives its own size from reactive data *and* redraws on that data changing.
- **`structuredClone()` throws on Pinia-reactive objects**: the sequencer store's undo/copy/paste helpers called `structuredClone()` directly on `body.value` (a Vue reactive Proxy), which throws `DataCloneError: could not be cloned` in Chrome. Because `pushUndoSnapshot()` runs *before* the actual mutation in every store action, this silently aborted every single effect placement/move/resize/delete — the UI looked completely inert (arm an effect, drag, nothing happens) with no visible error unless you were watching the console. Fixed by cloning via `JSON.parse(JSON.stringify(...))` instead, which reads through the proxy fine for our plain-JSON `SequenceBody` shape. General lesson: never call `structuredClone()` directly on a Pinia/Vue reactive ref's value — unwrap with `toRaw()` or JSON round-trip first.
- **Logout has 500'd since M0, undetected because there was no logout button and no test exercised it**: `AuthController::logout()` called the bare `Auth::logout()` facade; on a route behind `auth:sanctum`, Laravel's `Authenticate` middleware calls `Auth::shouldUse('sanctum')` on successful authentication, which changes what the *unnamed* default guard resolves to for the rest of the request — so `Auth::logout()` hit Sanctum's `RequestGuard`, which has no `logout()` method (`BadMethodCallException`). Fixed by naming the guard explicitly (`Auth::guard('web')->logout()` — 'web' is what `Auth::login()`/`Auth::attempt()` actually authenticate against, both in `register()`/`login()`), and added a real HTTP-round-trip test plus a "Log out" button in the UI (there wasn't one). General lesson: an untested, unreachable code path is a 500 waiting to happen — `actingAs()` in tests bypasses this entirely since it sets the user on all guards directly, which is exactly why this shipped for 7 milestones unnoticed.

- **Synthetic `PointerEvent`s don't support real pointer capture, breaking `DragControls` verification, not `DragControls` itself**: automated live-testing 3D drag by calling `canvas.dispatchEvent(new PointerEvent(...))` hit a `DOMException` from `DragControls`' internal `setPointerCapture()` call, since a browser-dispatched synthetic event carries no genuine tracked pointer session for the capture API to attach to. A real mouse drag always has one and is unaffected - confirmed by stubbing `Element.prototype.setPointerCapture` to a no-op for the verification pass only, after which the drag worked and persisted correctly. Same lesson as M10's "browser automation's synthetic drag doesn't reliably reach canvas pointer handlers at some viewport sizes" note: prefer dispatching real `PointerEvent`s over the coarser `left_click_drag`-style helpers when verifying canvas/WebGL pointer interactions, and be ready to neutralize capture-API quirks that only matter for genuinely OS-tracked pointers.

## Deviation log

- 2026-08-10: `composer create-project laravel/laravel` installs Laravel 13.x (goal prompt said "12.x-ish LTS"). Laravel 12 is not what `laravel/laravel` resolves to as of this date; using current stable 13 instead of pinning back to an EOL-adjacent 12.
- 2026-08-10: `render.yaml`'s Postgres connection env var is named `DB_URL`, not `DATABASE_URL`. `config/database.php`'s pgsql connection reads `env('DB_URL')` — using Render's own `DATABASE_URL` convention there silently falls back to `DB_DATABASE` default `laravel` on `127.0.0.1:5432` and fails at migrate time with a misleading "connection refused" instead of a config error.
- 2026-08-10: PHP 8.4, not 8.3 (goal prompt §4 locked 8.3). Laravel 13's Symfony 8.x dependency tree requires PHP >=8.4.1 (`symfony/console`, `http-kernel`, etc.) — confirmed via `composer why-not php 8.3` and a failed container boot on `php:8.3-fpm-alpine`. `composer.json` and the Dockerfile base image both bumped to 8.4.

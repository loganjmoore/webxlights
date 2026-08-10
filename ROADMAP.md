# webXLights Roadmap

Browser-based clone of xLights. Full spec: `xlights-functional-spec.md` (not committed here — kept alongside in Downloads/session notes; SPEC chapter refs below assume that doc). Build prompt: `webxlights-goal-prompt.md`.

Work milestone by milestone, in order. Each milestone: deployed to Render, CHANGELOG entry, demo note. Do not start N+1 with N's acceptance list unfinished.

## Milestones

- [x] **M0** — Skeleton + deploy. Monorepo, Docker, render.yaml, Sanctum auth, project CRUD, CI, COOP/COEP verified. Live: https://webxlights-web.onrender.com. R2 presign deferred to M2 (first milestone that needs media upload) — see DECISIONS.md.
- [x] **M1** — Layout MVP + rgbeffects import. 12 model types, node-coordinate math, groups, importer. Canvas is read-only render (drag-to-reposition + background photo underlay deferred — see DECISIONS.md).
- [x] **M2** — Sequencer shell + audio. Waveform, transport, canvas grid, timing tracks, effect placement/select/delete, undo/redo, autosave. Audio is client-side only (not R2-backed yet, re-select after reload) — see DECISIONS.md.
- [x] **M3** — Render engine v1. RenderBuffer, 10 blend modes, 10 effects (On + Bars/ColorWash/Fire/Meteors/Butterfly/SingleStrand/Snowflakes/Spirals/Twinkle), layer stack, node/channel mapping, 75 golden-frame + determinism tests. Worker pool deferred to M4 (needed once there's a live preview to keep off the main thread) — see DECISIONS.md.
- [x] **M4** — Live preview. Three.js Points house view, live-updates on scrub/edit by rendering active effects per row through the M3 engine. Runs on the main thread (no worker/SAB yet) and has no per-model mini-preview — see DECISIONS.md.
- [x] **M5** — fseq export + xsq import. fseq v2 (uncompressed) writer + reader, byte-exact against the SPEC header table; .xsq importer resolves EffectDB refs, translates 5 of 10 effects' params, keeps the other 5 as name/timing-only placeholders; exact-name model matching. Compression (zlib/zstd), R2 artifact archiving, and the manual model-mapping dialog are deferred — see DECISIONS.md.
- [x] **M6** — Effects wave 2 + curves + transitions (reduced scope — see DECISIONS.md). 5 new effects (Strobe, Ripple, Wave, Pinwheel, Shockwave; 15 total now implemented), a value-curve mechanism (Ramp type, proven on On's transparency param), and a Fade In/Out layer transition. The full 15-new-effect + full-VC-editor + full-transition-system ask was too large to match M0-M5's rigor in one pass; this is a real, tested slice of it, not all of it.
- [x] **M7** — Versioning, sharing, polish (reduced scope — see DECISIONS.md). Sequence snapshot/restore with history UI; project sharing (viewer/editor roles) via a shared `Project::authorize()` gate used by every controller; ETag-based autosave conflict detection with a keep-mine/take-theirs UI; "Package show" as a client-side zip (webXLights-native format, not xLights XML) that re-imports cleanly into a fresh project. Also fixed a real, previously-untested 500 in logout and added a logout button. Reverb live presence and quota guards are deferred — see DECISIONS.md.
- [x] **M8** — FPP Connect (Chromium path). Per SPEC ch16 §3.2 / ch13 §2.1/§2.4 exactly: Chromium detection (Client Hints + UA fallback, includes Edge), user-entered-host "discovery" (browsers can't receive FPP's UDP multicast ping), legacy `POST /api/file/uploads/<name>` + `GET /api/file/move/<name>` upload (Content-Type only, no custom headers), GET-merge-POST playlist sync matching FPP's exact JSON shape. Non-Chromium browsers get a guided-download message instead of a broken upload button. Feature-flagged (`FPP_CONNECT_ENABLED`); Export .fseq is untouched. Verified live against a mock FPP HTTP server (no real hardware available) — see DECISIONS.md.
- [x] **M9** — Hardening + parity harness + docs (reduced scope — see DECISIONS.md). Fixed a real O(n²) full-export perf bug (stateful effects replayed from start every frame — now a proper sequential renderer, ~6.2s for the 20k-channel/3.6k-frame budget vs. a 60s ceiling); grid virtualization (fixed-viewport canvas, only visible rows drawn); a last-resort error banner for uncaught errors; an onboarding sample project (synthesized demo audio + pre-built layout/sequence) reachable from a first-time signup with zero manual file handling; `/docs` (import guide + an effect reference generated from the param registry); `PARITY.md`. OPFS spill, the worker-pool/SAB render architecture, and a real `xLights --headless` parity harness are honest, documented gaps, not attempted — see DECISIONS.md.

## Planned next: M10-M12

Not started. Full spec, reviewed three ways (technical feasibility, xLights UX-parity,
scope discipline) before being written down: `NEXT-MILESTONES.md`.

- **M10** — Sequencer interaction parity: render timing marks (stored since M2, never drawn),
  left-edge effect resize, right-click context menu, plus two real bugs found in the same
  code (broken horizontal zoom/scroll, undo snapshotting every pointermove during a drag).
- **M11** — Controllers: a real controller/output model (DDP first, E1.31 deferred), a
  Controllers page matching the reference screenshot, and an `.fseq` export rewrite that
  routes through actual controller channel allocation instead of import-order concatenation.
- **M12** — Layout editing, 2D first then 3D: this repo has never shipped 2D drag-to-
  reposition (documented ceiling since M1) — M12 builds that first (proves the `updateModel()`
  persist path, which currently has zero callers), then adds a 3D editing mode. **Reverses
  the 3D non-goal below** for editing only — 3D live-preview rendering fidelity (textures,
  mesh objects) stays out of scope, see NEXT-MILESTONES.md.

## Non-goals for v1 (hard scope fence)

Deferred, each has a SPEC chapter for later:

- Live UDP/serial output of any kind (SPEC ch16 §3 — browsers can't do raw UDP; local bridge daemon is post-v1)
- xSchedule / scheduling / show-player features (SPEC ch13)
- AC/ramp mode (SPEC ch1 LOR legacy)
- DMX moving-head/servo/skull model family (SPEC ch4 §5)
- 3D layout *editing* — reversed by planned M12 above (2D drag-to-reposition, then 3D
  orbit/pan/zoom + drag-to-move). Mesh/GDTF objects and per-preview cameras remain out of
  scope, and M12 does not add textured/image-mapped 3D rendering fidelity (SPEC ch5)
- Shader (ISF), Liquid (physics), Glediator/Guitar/Piano/Video effects (SPEC ch7-8)
- Lyric tracks + phoneme faces — Faces effect ships as static-matrix subset only if trivial, else defer (SPEC ch1 §2c)
- Papagayo/LOR/Vixen imports — only native xLights .xsq/.rgbeffects/.xmap in v1 (SPEC ch14)
- Controller vendor upload payloads (SPEC ch3)
- Marketplace

## Performance budgets (gated at M9, tracked from M3)

Medium show = 20k channels, 3 min, 50ms frames: full render ≤60s on 4-core laptop; preview ≥30fps while rendering; grid 60fps at 100 visible rows/5k effects; UI actions <100ms; SPA initial JS <1.5MB gzip; memory <1.5GB; autosave payload <500KB typical.

Measured at M9: full render of the exact medium-show benchmark (a permanent regression test, `packages/engine/test/perf.test.ts`) — **~6.2s**, well inside budget, after fixing an O(n²) blowup in stateful-effect full-sequence rendering (see DECISIONS.md). Grid virtualization now keeps row-draw cost flat regardless of total row count. SPA initial JS gzip is **~237KB** (well under 1.5MB) as of M8. Preview fps, UI-action latency, memory, and autosave payload size are not instrumented with automated checks — no tooling in this environment measures real browser frame timing/memory across a range of hardware, so these remain unverified rather than falsely claimed met.

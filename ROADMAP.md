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
- [ ] **M7** — Versioning, sharing, polish. Snapshots, roles, Reverb presence, package show.
- [ ] **M8** — FPP Connect (Chromium path). LNA upload, playlist sync.
- [ ] **M9** — Hardening + parity harness + docs. Perf budgets, OPFS spill, PARITY.md.

## Non-goals for v1 (hard scope fence)

Deferred, each has a SPEC chapter for later:

- Live UDP/serial output of any kind (SPEC ch16 §3 — browsers can't do raw UDP; local bridge daemon is post-v1)
- xSchedule / scheduling / show-player features (SPEC ch13)
- AC/ramp mode (SPEC ch1 LOR legacy)
- DMX moving-head/servo/skull model family (SPEC ch4 §5)
- 3D layout mode, mesh/GDTF objects, per-preview cameras — 2D layout only in v1 (SPEC ch5)
- Shader (ISF), Liquid (physics), Glediator/Guitar/Piano/Video effects (SPEC ch7-8)
- Lyric tracks + phoneme faces — Faces effect ships as static-matrix subset only if trivial, else defer (SPEC ch1 §2c)
- Papagayo/LOR/Vixen imports — only native xLights .xsq/.rgbeffects/.xmap in v1 (SPEC ch14)
- Controller vendor upload payloads (SPEC ch3)
- Marketplace

## Performance budgets (hard gates at M9, tracked from M3)

Medium show = 20k channels, 3 min, 50ms frames: full render ≤60s on 4-core laptop; preview ≥30fps while rendering; grid 60fps at 100 visible rows/5k effects; UI actions <100ms; SPA initial JS <1.5MB gzip; memory <1.5GB; autosave payload <500KB typical.

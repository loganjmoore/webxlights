# webXLights Roadmap

Browser-based clone of xLights. Full spec: `xlights-functional-spec.md` (not committed here — kept alongside in Downloads/session notes; SPEC chapter refs below assume that doc). Build prompt: `webxlights-goal-prompt.md`.

Work milestone by milestone, in order. Each milestone: deployed to Render, CHANGELOG entry, demo note. Do not start N+1 with N's acceptance list unfinished.

## Milestones

- [ ] **M0** — Skeleton + deploy. Monorepo, Docker, render.yaml, R2 presign, Sanctum auth, project CRUD, CI, COOP/COEP verified.
- [ ] **M1** — Layout MVP + rgbeffects import. 12 model types, node-coordinate math, groups, importer.
- [ ] **M2** — Sequencer shell + audio. Waveform, transport, virtualized grid, timing tracks, effect placement, undo/redo.
- [ ] **M3** — Render engine v1. RenderBuffer, blend modes, 10 effects, worker pool, golden-frame tests.
- [ ] **M4** — Live preview. Three.js Points from SAB, per-model mini-preview.
- [ ] **M5** — fseq export + xsq import. fseq v2 writer, .xsq importer with placeholder fallback.
- [ ] **M6** — Effects wave 2 + curves + transitions. 15 more effects, value curves, layer transitions.
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

# PARITY.md

xLights feature coverage vs. webXLights, milestone by milestone. "Status" is honest about what
actually runs today, not what's aspirational — see `DECISIONS.md` for the full reasoning and
scope decisions behind every ⚠️/❌ row. SPEC chapter numbers refer to `xlights-functional-spec.md`.

Legend: ✅ implemented (default/common path) · ⚠️ partial (documented ceiling) · ❌ not implemented

## Models & layout (SPEC ch4, ch5)

| Feature | Status | Notes |
|---|---|---|
| Model types (12 of the goal prompt's list) | ✅ | Matrix, Single Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath, Custom |
| Matrix wiring variants | ⚠️ | Vertical/Top Left/zigzag/1 strand-per-string only |
| Model Groups | ✅ | Membership + buffer style |
| Screen placement on import | ⚠️ | `WorldPosX/Y` + `ScaleX` only — correct relative position, not exact rotation/shear |
| Layout canvas | ⚠️ | Read-only render; no drag-to-reposition, no background photo underlay |
| 2D layout | ✅ | Canvas-based |
| 3D layout, view objects, mesh/GDTF | ❌ | Non-goal for v1 (SPEC ch5) |
| DMX moving-head/servo/skull family | ❌ | Non-goal for v1 (SPEC ch4 §5) |

## Sequencer (SPEC ch6)

| Feature | Status | Notes |
|---|---|---|
| Timeline grid, effect place/select/move/resize | ✅ | Canvas-based, virtualized to a fixed viewport (M9); resize from either edge with snap-to-timing-mark, right-click context menu (copy/cut/paste/duplicate/delete) (M10) |
| Horizontal zoom/scroll | ✅ | Fixed M10 — canvas now sizes to the real content width instead of clipping at the container edge |
| Undo/redo | ⚠️ | Whole-body snapshots, not command-pattern inverses; a drag now snapshots once at drag start, not per pointermove (M10) |
| Autosave | ✅ | With ETag-based conflict detection (M7) |
| Timing tracks | ⚠️ | Rendered on a pinned ruler row, click-to-add/right-click-to-delete (M10); manual marks only, no fixed-interval/beat-bar generators, no lyric tracks |
| Copy/paste effects | ✅ | Via right-click context menu (M10); Cut and Duplicate too |
| Waveform + playback | ✅ | Native `AudioContext`, peaks computed on main thread |
| Audio persistence | ✅ | Server-side, a Render persistent disk-backed Laravel disk; auto-restores on sequencer load, no manual re-select |

## Effects (SPEC ch7-9)

| Feature | Status | Notes |
|---|---|---|
| Effects implemented | ⚠️ | 15 of ~56 named effects (On, Bars, Color Wash, Fire, Meteors, Butterfly, SingleStrand, Snowflakes, Spirals, Twinkle, Strobe, Ripple, Wave, Pinwheel, Shockwave) |
| Each implemented effect's default/common render path | ✅ | Faithful to the SPEC's math; rarer option combinations (alternate directions, other render methods, etc.) are per-effect documented ceilings — see DECISIONS.md M3/M6 notes |
| Shader (ISF), Liquid, Glediator, Video, VUMeter | ❌ | Non-goal for v1 / no audio-reactive pipeline yet |
| Layer blend modes | ⚠️ | 10 of 24 (Normal, Effect 1/2, Average, Additive, Subtractive, Max, Min, 1/2 reveals) |
| Value curves | ⚠️ | One type (Ramp/linear), wired to one param (`On.transparencyPct`) as a proof of the mechanism |
| Transitions | ⚠️ | Fade In/Out only; no Wipe/From Middle/Circle Explode |
| Buffer styles / sub-buffers | ❌ | Every effect renders into the model's default full buffer |

## File formats (SPEC ch11)

| Feature | Status | Notes |
|---|---|---|
| `.xlights_rgbeffects.xml` import | ⚠️ | Unsupported `DisplayAs` types import as labeled placeholders, not dropped |
| `.xsq` import | ⚠️ | 5 of 15 implemented effects get full param translation; others import with correct name/timing, schema-default params; exact-name-only model matching |
| `.fseq` export | ⚠️ | V2 uncompressed only (no zlib/zstd); placeholder channel layout (no real controller/universe allocation) |
| `.fseq` import | ❌ | Not implemented |
| `.xmodel`, `.xtiming`, `.xmap`, `.xpreset` | ❌ | Not implemented |
| `xlights_networks.xml` (controllers/outputs) | ❌ | Non-goal for v1 — display/export math only, no controller upload |

## Sharing, versioning & collaboration (not an xLights feature — webXLights-native, M7)

| Feature | Status | Notes |
|---|---|---|
| Sequence snapshot/restore | ✅ | With a history UI |
| Project sharing (viewer/editor roles) | ✅ | Single `Project::authorize()` gate across every controller |
| Live presence ("locked by", avatars) | ❌ | Would need a paid Reverb service; the ETag conflict mechanism covers "collaborate without clobbering" without it |
| "Package show" | ⚠️ | Client-side zip in a webXLights-native format (manifest + sequence JSON), not xLights' rgbeffects/xsq zip — re-imports cleanly into a fresh webXLights project, not into xLights itself |

## Output & FPP integration (SPEC ch13, ch16)

| Feature | Status | Notes |
|---|---|---|
| Live UDP/serial output (E1.31, Art-Net, DDP, etc.) | ❌ | Non-goal for v1 — browsers cannot open raw UDP/TCP sockets (SPEC ch16 §3) |
| FPP Connect: legacy file upload | ✅ | `POST /api/file/uploads/<name>` + `GET /api/file/move/<name>`, Chromium-only (Local Network Access) |
| FPP Connect: chunked PATCH upload (FPP 7+) | ❌ | SPEC notes it fails FPP's current CORS preflight; legacy path is what the goal prompt asked for |
| FPP Connect: playlist sync | ✅ | GET-merge-POST matching FPP's exact JSON shape |
| FPP Connect: config/outputs/models/proxy sync | ❌ | Out of scope — display + export + basic playlist only |
| FPP discovery (UDP multicast/mDNS) | ❌ | Browsers can't receive multicast; discovery is a user-entered host verified via `/api/system/info` |
| Local bridge daemon (live preview-to-lights) | ❌ | Explicitly Phase 3 / post-v1 per SPEC ch16 §3.5 |
| xSchedule / scheduling / show-player | ❌ | Non-goal for v1 (SPEC ch13) |
| Papagayo/LOR/Vixen imports | ❌ | Non-goal for v1 — only native xLights formats (SPEC ch14) |

## Everything else

| Feature | Status | Notes |
|---|---|---|
| Auth, projects, CRUD | ✅ | Sanctum SPA cookie auth |
| AC/ramp mode (LOR legacy) | ❌ | Non-goal for v1 |
| Lyric tracks, phoneme faces | ❌ | Non-goal for v1 |
| Marketplace | ❌ | Non-goal for v1 |
| Onboarding sample project | ✅ | Synthesized demo audio (not a licensed track — see DECISIONS.md), pre-built layout + sequence (M9) |
| OPFS spill (>300MB shows) | ❌ | Not attempted — see DECISIONS.md M9 note |
| Worker pool + SharedArrayBuffer frame store | ❌ | Not attempted — main-thread rendering measured within budget at tested scale; see DECISIONS.md M9 note |
| Grid virtualization (100 rows / 5k effects) | ✅ | Fixed-viewport canvas, only visible rows drawn (M9) |
| Full-sequence render performance | ✅ | O(n) sequential frame renderer (was O(n²) for stateful effects before M9) — 20k channels × 3min × 50ms frames in ~6s, budget is 60s |

## Determinism / parity harness

**Not implemented.** The goal prompt's M9 asks for a CI comparison of webXLights `.fseq` output
against `xLights --headless` renders of the same `.xsq` (the "fseqcmp" discipline referenced in
the SPEC's own `AGENTS.md`). This needs a real xLights install to run headless in CI, which
isn't available in this environment — building the harness's plumbing without ever running it
against real xLights output wouldn't actually prove anything. Documented here as a real gap, not
attempted, rather than claimed done. The engine's own golden-frame and determinism tests (106
tests in `packages/engine`, hand-computed where the math is tractable by hand) are the
practical substitute today.

# PARITY.md

xLights feature coverage vs. webXLights, milestone by milestone. "Status" is honest about what
actually runs today, not what's aspirational — see `DECISIONS.md` for the full reasoning and
scope decisions behind every ⚠️/❌ row. SPEC chapter numbers refer to `xlights-functional-spec.md`.

Legend: ✅ implemented (default/common path) · ⚠️ partial (documented ceiling) · ❌ not implemented

## Models & layout (SPEC ch4, ch5)

| Feature | Status | Notes |
|---|---|---|
| Model types (12 of the goal prompt's list) | ✅ | Matrix, Single Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath, Custom. Counts are read from xLights' descriptive attribute names *and* the generic `parm1`/`parm2`/`parm3` they replaced in the 2026.04 release, so a show saved before that release imports at its real sizes instead of at library defaults |
| Matrix wiring variants | ⚠️ | Vertical/Top Left/zigzag/1 strand-per-string only |
| SubModels | ⚠️ | Node-range and sub-buffer sub-models import from `<subModel>` elements, resolve to their own geometry and buffer, appear under their parent model in the sequencer, and render in the preview and the `.fseq` export. No in-app editor for creating them |
| Model Groups | ✅ | Membership + buffer style, both import-only until M15.5 - a full Groups panel now exists on the Layout page (create, rename, delete, edit membership via checklist), matching real xLights' Groups tab. This row previously read ✅ while the only way to create or edit a group at all was re-importing `xlights_rgbeffects.xml` - corrected here, not a new gap |
| Screen placement + scale on import | ⚠️ | All four of xLights' placement systems are applied per model type: **boxed** (`WorldPos` as centre, `ScaleX/Y/Z`, `RotateZ`), **two-point** (`WorldPos` is one endpoint, `X2/Y2/Z2` the offset to the other — anchor, span and angle all derive from that vector) and **three-point** (two-point plus `Height`). How a boxed model's `ScaleX` sizes it is decided per file rather than assumed: the two readings (`ScaleX` x node count, or `ScaleX` as the world width outright) differ by a model's node count, and xLights' documentation says only "ScaleXYZ determine the size of the model". The importer picks using evidence in the show - a prop can't be wider than the spread of the models' own positions, and boxed props should be in the same size league as the ones sized by their endpoints - reports which reading it used, and the Layout page has a one-click toggle to override it (`models/boxedScale.ts`). Every model type shares one `screenX/screenY` unit convention (`models/units.ts`). A run drawn right-to-left is mirrored along its own X rather than turned through 180 degrees, so an arch anchored from its far end stays an arch instead of becoming a bowl. A negative `ScaleX/Y/Z` is read as a magnitude: in xLights that sign is how a model whose local Y runs opposite to ours is drawn upright, not an instruction to mirror, and taking it literally stood every tree on its point. The import banner reports how many models it applied to. Still unapplied: `RotateX`/`RotateY` (only `RotateZ` is read). **poly-line** (`PointData`'s vertex list is the model's shape as well as its position, so a run that turns a corner imports as that run rather than as a straight line of the right node count) is applied too. Its coordinate convention is the one part not confirmable without a real file — xLights has written these normalized into 0..1 and as plain world offsets — so both readings are accepted, told apart at parse time, and named per model in the placement report. Still unimplemented: `cPointData`'s curved Poly Line segments (drawn as straight ones between their endpoints) and three-point `Shear`/`Angle`. Not yet diffed against a real xLights layout |
| Layout canvas | ✅ | Drag-to-reposition (M12); marquee multi-select with multi-drag and one-confirmation bulk delete, plus corner/edge resize handles computed in the model's own unrotated frame (drawn standing off the model on a dashed box, after a report that they couldn't be seen against a lit prop); drag-to-create from an 11-type model palette (M13, Custom excluded); every model's actual rendered/rotated/scaled bounds now drive auto-fit and hit-testing, not a buffer-dimension guess (M14); no background photo underlay |
| 2D layout | ✅ | Canvas-based |
| 3D layout editing | ✅ | Orbit/pan/zoom, per-model picking (invisible pick meshes sized/centered to each model's real transformed bounds, not the shared Points cloud), axis-constrained drag-to-move (X/Y by default, depth while Z is held; replaces `DragControls`, which can only drag in the camera-facing plane), a ground plane nothing can be dragged below, a Reset view button, and a numeric X/Y/Z/Scale X/Scale Y/Rotate panel (M12, scale-Y and real rotation rendering added M14). Scaling in 3D is still numeric — no draggable handles in this view |
| Structural property editor (# Strings, Tree Degrees/Type, Matrix size, etc.) | ⚠️ | Layout page "Properties" panel (M15.2), scoped to exactly the `raw_attrs` keys `computeGeometryFromAttrs` reads per type — every field has a real, visible effect. Real xLights' fuller property grid (Rotation/Spiral Wraps/Perspective on Tree, matrix wiring direction, etc.) isn't offered since this engine doesn't render those attributes yet |
| 3D rendering fidelity (textures, mesh/GDTF objects, per-preview cameras) | ❌ | Non-goal for v1 (SPEC ch5) — M12 reverses only the "no 3D editing" non-goal, not rendering fidelity |
| View objects (`<view_objects>`: Gridlines, Mesh, Terrain, Ruler, Image, Controller) | ⚠️ | A separate XML element from `<models>`, previously not parsed at all (every real show's Gridlines helper was silently dropped on import). Gridlines imports and renders in both 2D (flat X/Y reference grid) and 3D (a proper ground-plane grid respecting independent Width/Height and the real RotateX/Y/Z) as of M15.7, matching the Layout page's real "Active" checkbox. Mesh/Terrain/Ruler/Image/Controller import (kept, not silently lost) but don't render — Mesh/Terrain need an OBJ/heightmap loader this engine doesn't have |
| 3D preview / house visualizer | ✅ | Three.js, orbit/zoom/pan, per-model depth from `WorldPosZ`, glow bulbs, ground grid, camera presets, plays the sequence at display refresh rate |
| 3D layout *editing*, view objects, mesh/GDTF | ❌ | Non-goal for v1 (SPEC ch5) — models are still positioned in the 2D layout, the 3D view is display-only |
| DMX moving-head/servo/skull family | ❌ | Non-goal for v1 (SPEC ch4 §5) |

## Sequencer (SPEC ch6)

| Feature | Status | Notes |
|---|---|---|
| Timeline grid, effect place/select/move/resize | ✅ | Canvas-based, virtualized to a fixed viewport (M9); resize from either edge with snap-to-timing-mark, right-click context menu (copy/cut/paste/duplicate/delete) (M10) |
| Effect placement gesture | ✅ | Arm a palette effect + drag on the grid (xLights' own gesture, sizes the effect in one motion) **and** native HTML5 drag-and-drop straight from the palette button onto the grid at a default 1s length (M15) — two ways to the same result, not two different mechanisms |
| Horizontal zoom/scroll | ✅ | Fixed M10 — canvas now sizes to the real content width instead of clipping at the container edge |
| Undo/redo | ⚠️ | Whole-body snapshots, not command-pattern inverses; a drag now snapshots once at drag start, not per pointermove (M10) |
| Autosave | ✅ | With ETag-based conflict detection (M7) |
| Timing tracks | ⚠️ | Rendered on a pinned ruler row, click-to-add/right-click-to-delete (M10). Fixed-interval and Metronome (BPM) generators added M15.6 (matches real xLights' New Timing dialog's 25/50/100ms and Metronome options - FPP Commands/Effects and tag data out of scope), each generating a new named track rather than overwriting one - a real imported sequence commonly has several meaningfully-named tracks (Beats, Lyrics, etc.) with no guaranteed ordering. All tracks still render merged onto one pinned ruler, not as separate rows like real xLights' Timings list (a larger `SequencerGrid.vue` rendering change, not attempted) - no lyric tracks |
| Copy/paste effects | ✅ | Via right-click context menu (M10); Cut and Duplicate too |
| Row (model/group) visibility | ✅ | A "Models" panel toggles which rows show on the grid, per sequence — a view preference (localStorage), not sequence data; doesn't touch which models/groups actually have effects (M15) |
| Waveform + playback | ✅ | Native `AudioContext`, peaks computed on main thread |
| Audio persistence | ✅ | Server-side, a Render persistent disk-backed Laravel disk; auto-restores on sequencer load, no manual re-select |

## Effects (SPEC ch7-9)

| Feature | Status | Notes |
|---|---|---|
| Effects implemented | ⚠️ | 38 of 55 named effects (adds Lines, Spirograph, Shape, Music, Fireworks, Tree) (On, Off, Bars, Candle, Life, Lightning, Color Wash, Fire, Meteors, Butterfly, SingleStrand, Snowflakes, Snow Storm, Spirals, Twinkle, Shimmer, Strobe, Ripple, Wave, Pinwheel, Shockwave, Garlands, Curtain, Fill, Plasma, Galaxy, Fan, Marquee, Circles, Text, Pictures, VU Meter). The full list, and which of the remaining 26 need infrastructure we don't have, is in docs/MANUAL-COVERAGE.md |
| Each implemented effect's default/common render path | ✅ | Faithful to the SPEC's math; rarer option combinations (alternate directions, other render methods, etc.) are per-effect documented ceilings — see DECISIONS.md M3/M6 notes |
| Per-effect Color palette | ⚠️ | Real xLights' Color tab: 1–6 swatches per effect (M15.3), editable via the Sequencer's effect panel, falling back to the app-wide default when unset. Multi-color blending across the palette (`multiColorBlend`) already existed for effects that use it; still missing real xLights' per-swatch checkboxes ("C"/"c" toggles), palette presets, and the "colors reflect music" audio-reactive option |
| Shader (ISF), Liquid, Glediator, Video, VUMeter | ❌ | Non-goal for v1 / no audio-reactive pipeline yet |
| Layer blend modes | ⚠️ | 18 of 24, all selectable per effect via the Sequencer's Layer Blending panel. The panel now reads its list from the engine, so a mode can't be implemented and left unofferable the way all 10 originally were |
| "Mix" / Effect Mix Threshold slider | ⚠️ | The reveal/fade threshold some blend modes read - implemented since M3, wired to a UI slider in M15.4 (was hardcoded 0 everywhere) |
| Audio-reactive effects (VU Meter) | ⚠️ | 7 of ~20 VU Meter types (Spectrum, Volume Bars, Level Bar, Level Pulse, Level Color, Intensity Wave, Waveform), on an offline per-frame FFT of the loaded track. The analysis now actually reaches the renderer: the sequencer analyses a track once on load and hands the same series to the house preview, the popped-out preview and the .fseq export, so a meter renders identically in all three |
| Text effect | ⚠️ | Built-in 5×7 bitmap font only — no system font picker, outline/shadow options, or multi-line layout |
| Pictures effect | ⚠️ | Images stored in the sequence body, downscaled to 64px on the long edge (no asset store yet) |
| Shader (ISF), Liquid, Glediator, Video | ❌ | Non-goal for v1 |
| Layer blend modes | ⚠️ | 18 of 24 (the original ten plus 1/2 is Mask, 1/2 is Unmask, Shadow 1 on 2, Shadow 2 on 1, Layered, Brightness). The manual documents these with screenshots rather than words, so the eight added follow what their names mean rather than a spec - see docs/MANUAL-COVERAGE.md |
| Layer settings: Transformation / Blur / Sub-buffer | ✅ | Rotate 90 either way, rotate 180, flip H/V; an alpha-weighted box blur; and a percentage sub-buffer, all applied between the effect and the model so they work on every effect |
| Layer settings: Render Style | ⚠️ | The six styles meaningful for a single model (Default, Per Preview, Single Line, As Pixel, Horizontal/Vertical Per Strand). Layers now composite in node space rather than buffer space, so each layer can render into a differently-shaped buffer |
| Layer settings: Persistent / Roto-Zoom | ❌ | See docs/MANUAL-COVERAGE.md |
| Value curves | ✅ | All 16 types (Flat, Ramp, Ramp Up/Down, Ramp Down/Up, Saw Tooth, Triangle, Sine, Abs Sine, Square, Parabolic Up/Down, Logarithmic Up/Down, Exponential Up/Down, Custom) with cycles/phase/reverse, a draggable point editor for Custom and six presets, reachable from the props panel on every VC-flagged param of every effect |
| Transitions | ✅ | 16 types (Fade, Wipe, Wipe Vertical, From Middle, To Middle, Square Explode/Implode, Circle Explode/Implode, Clock, Blinds, Slide Bars, Bow Tie, Star, Checkerboard, Ripple), in and out, each with its own type, duration and reverse, plus a pattern-density knob on the three types that read one - all set from the props panel's Transitions section |
| Buffer styles / sub-buffers | ⚠️ | Sub-buffer implemented: an effect can be confined to part of a model, and is handed that smaller buffer to compose itself into rather than being cropped to it (the manual's own distinction). The 19 *render styles* (Per Preview, stacked, per-model, ...) are still unimplemented - every effect renders into the model's default buffer |

## File formats (SPEC ch11)

| Feature | Status | Notes |
|---|---|---|
| `.xlights_rgbeffects.xml` import | ⚠️ | Unsupported `DisplayAs` types import as labeled placeholders, not dropped. Verified live M15.1 against a real 120-model/11-group show: legacy style-variant spellings ("Tree 360", "Horiz/Vert Matrix" — what xLights actually writes to disk for those types) are normalized to their canonical type before the supported-type check (fixed M15.1 — previously 29% of this real file's models were wrongly downgraded). Genuinely-unsupported types (`DmxServo`, `DmxGeneral`, `Cube`) remain labeled placeholders as designed |
| `.xsq` import | ⚠️ | 5 of 15 implemented effects get full param translation; others import with correct name/timing and the engine's own schema-default params (fixed M15.1 — previously imported with empty `{}` params, which crashed `.fseq` export for 10 of those 15 effects). Model rows match by exact name; a name miss now falls back to matching a Model Group before being reported unmatched (fixed M15.1 — real real-world sequences commonly target groups: 37% of one real show's targeted elements). The unmatched-models/untranslated-effects summary is now actually shown to the user as a dismissible banner on the Sequencer page (fixed M15.1 — previously computed then discarded by navigation). Verified live M15.1 against a real 30-row/804-effect sequence |
| `.fseq` export | ⚠️ | V2 uncompressed only (no zlib/zstd). Channel allocation is real controller-based addressing, not placeholder (M11). A Model Group's effects do not reach the export (`fseqExport.ts` only reads `elementType === "model"` rows) — a real, undocumented-until-M15.1 gap; 37% of one real show's targeted elements are groups. Verified live M15.1: exported a real 4829-frame/588MB file from a real show and opened it in the real desktop xLights app (File → Open Sequence) — opened cleanly, correctly correlated channels back to real model/group names, effect timing matched webXLights' own Sequencer. The one thing M15 flagged as never actually checked |
| `.xlights_rgbeffects.xml` import | ⚠️ | Unsupported `DisplayAs` types import as labeled placeholders, not dropped |
| `.xsq` import | ⚠️ | 5 of 25 implemented effects get full param translation; others import with correct name/timing, schema-default params; exact-name-only model matching |
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

## Controllers (SPEC ch3)

| Feature | Status | Notes |
|---|---|---|
| Controller CRUD | ✅ | `ControllersPage.vue`, DDP/Ethernet/USB/Null protocols; "Add Ethernet" defaults to DDP (M11) |
| Per-model controller assignment | ✅ | From the Layout page's model sidebar; `controller_offset` + `channel_count` validated server-side (422 if it overflows the controller's span) |
| `.fseq` export channel allocation | ✅ | Real `controller.start_channel - 1 + controller_offset` addressing; unassigned models write sequentially after the highest controller-routed span — not import-order concatenation anymore (M11) |
| E1.31/Art-Net universe math | ❌ | Deferred with DDP-first — see DECISIONS.md M11 |
| `xlights_networks.xml` import | ❌ | No parser exists in `packages/formats`; manual entry only |
| Live network output (DDP/E1.31 over the wire) | ❌ | Non-goal for v1 — browsers can't open raw UDP sockets, same ceiling as FPP Connect below |

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
tests in `packages/engine` at M9, hand-computed where the math is tractable by hand) are the
practical substitute today (234 tests in `packages/engine` as of the M6-completion pass).

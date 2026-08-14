# PARITY.md

xLights feature coverage vs. webXLights, milestone by milestone. "Status" is honest about what
actually runs today, not what's aspirational — see `DECISIONS.md` for the full reasoning and
scope decisions behind every ⚠️/❌ row. SPEC chapter numbers refer to `xlights-functional-spec.md`.

Legend: ✅ implemented (default/common path) · ⚠️ partial (documented ceiling) · ❌ not implemented

## Models & layout (SPEC ch4, ch5)

| Feature | Status | Notes |
|---|---|---|
| Model types (17 of xLights' 21) | ✅ | Matrix, Single Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath, Custom, Spinner, Cube, Sphere, Channel Block, Image. Cube carries real depth and unwraps its layers into the buffer, which is the manual's "while the model is 3D, xLights renders the effects in 2D"; Channel Block is a row of independent cells rather than a shape, since it models relays and AC lights; Image is a single-channel prop, so one node is its whole geometry. Label is a non-goal - it is a text annotation that "does not control any lights or channels". Still missing: per-channel Channel Colors, and the DMX/Servo fixture family (a separate non-goal). Counts are read from xLights' descriptive attribute names *and* the generic `parm1`/`parm2`/`parm3` they replaced in the 2026.04 release, so a show saved before that release imports at its real sizes instead of at library defaults |
| Matrix wiring variants | ⚠️ | Vertical/Top Left/zigzag/1 strand-per-string only |
| SubModels | ⚠️ | Node-range and sub-buffer sub-models import from `<subModel>` elements, resolve to their own geometry and buffer, appear under their parent model in the sequencer, and render in the preview and the `.fseq` export. They can now be created and edited in-app from the Layout page, with a live count of what each spec resolves to against the parent's real node list. Missing: xLights' Draw Model and Generate Slices tools |
| Model Groups | ✅ | **Group rows now render.** Until this pass a group row could be created, sequenced and autosaved, but both the house preview and the `.fseq` export filtered to model and sub-model rows — so an effect placed on a group reached nothing at all, silently. Real sequences target groups constantly (37% of one real show's sequenced elements), so this was whole passages of a show going dark with no error anywhere. A group is now composed into one buffer per its render style, rendered once, and scattered back onto its members; a model in two groups layers rather than being blanked. Membership editing came earlier: a full Groups panel on the Layout page (create, rename, delete, edit membership via checklist), matching real xLights' Groups tab — before that the only way to create or edit a group at all was re-importing `xlights_rgbeffects.xml` |
| Screen placement + scale on import | ⚠️ | All four of xLights' placement systems are applied per model type: **boxed** (`WorldPos` as centre, `ScaleX/Y/Z`, `RotateZ`), **two-point** (`WorldPos` is one endpoint, `X2/Y2/Z2` the offset to the other — anchor, span and angle all derive from that vector) and **three-point** (two-point plus `Height`). How a boxed model's `ScaleX` sizes it is decided per file rather than assumed: the two readings (`ScaleX` x node count, or `ScaleX` as the world width outright) differ by a model's node count, and xLights' documentation says only "ScaleXYZ determine the size of the model". The importer picks using evidence in the show - a prop can't be wider than the spread of the models' own positions, and boxed props should be in the same size league as the ones sized by their endpoints - reports which reading it used, and the Layout page has a one-click toggle to override it (`models/boxedScale.ts`). Every model type shares one `screenX/screenY` unit convention (`models/units.ts`). A run drawn right-to-left is mirrored along its own X rather than turned through 180 degrees, so an arch anchored from its far end stays an arch instead of becoming a bowl. A negative `ScaleX/Y/Z` is read as a magnitude: in xLights that sign is how a model whose local Y runs opposite to ours is drawn upright, not an instruction to mirror, and taking it literally stood every tree on its point. The import banner reports how many models it applied to. Still unapplied: `RotateX`/`RotateY` (only `RotateZ` is read). **poly-line** (`PointData`'s vertex list is the model's shape as well as its position, so a run that turns a corner imports as that run rather than as a straight line of the right node count) is applied too. Its coordinate convention is the one part not confirmable without a real file — xLights has written these normalized into 0..1 and as plain world offsets — so both readings are accepted, told apart at parse time, and named per model in the placement report. Still unimplemented: `cPointData`'s curved Poly Line segments (drawn as straight ones between their endpoints) and three-point `Shear`/`Angle`. Not yet diffed against a real xLights layout |
| Generate custom model from a photo | ✅ | Bright pixels become nodes; threshold, grid width and all four wiring orders. The wiring order is the *channel* order, so a prop wired back and forth but numbered straight chases backwards on alternate rows - which looks like a broken effect rather than a numbering bug, and is why all four are offered. The grid it writes is asserted to be one `parseCustomModelGrid` reads back |
| Replace model | ✅ | Swaps a model's type in place, keeping its position, controller assignment and sub-models. `raw_attrs` is cleared, since the attributes are per-type and a Tree's `TreeDegrees` on an Arches model is a value nothing reads that would reappear if the type were ever changed back |
| Model list conveniences | ✅ | Filter by name/type/controller; clone the selected model N times (geometry, sub-models and string type, but not its controller assignment); auto-assign start channels to every unassigned model. The allocator is first-fit, never moves an existing assignment, and reports what it couldn't place — and its output is asserted to produce no collisions in the visualiser |
| Layout previews | ✅ | All Models / Default / Unassigned plus any preview the models name, chosen from the Layout page and applied to the 2D canvas, the 3D canvas and the model list together. A model's preview comes from its own attribute or from a group it belongs to; the named list is computed from the models rather than stored, so it can't outlive them |
| Layout canvas | ✅ | Drag-to-reposition (M12); marquee multi-select with multi-drag and one-confirmation bulk delete, plus corner/edge resize handles computed in the model's own unrotated frame (drawn standing off the model on a dashed box, after a report that they couldn't be seen against a lit prop); drag-to-create from an 11-type model palette (M13, Custom excluded); every model's actual rendered/rotated/scaled bounds now drive auto-fit and hit-testing, not a buffer-dimension guess (M14); and a background photo underlay: a picked image is downscaled on the client, stored as a data URL beside the layout's other settings, and composited behind the canvas rather than painted into it - so it costs nothing on the redraw that happens on every pointermove of a drag |
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
| Radial effect wheel | ✅ | Double-click empty grid opens a ring of effects at the pointer, and the picked one lands there rather than at the playhead - the point of the gesture is that it happens where you already are. Its list is the single-letter shortcut list, not a second copy of it |
| Effect placement gesture | ✅ | Arm a palette effect + drag on the grid (xLights' own gesture, sizes the effect in one motion) **and** native HTML5 drag-and-drop straight from the palette button onto the grid at a default 1s length (M15) — two ways to the same result, not two different mechanisms |
| Horizontal zoom/scroll | ✅ | Fixed M10 — canvas now sizes to the real content width instead of clipping at the container edge |
| Keyboard shortcuts and command palette | ✅ | One registry drives the key dispatch, the palette (Ctrl+Shift+K) and the key labels shown beside each command. Transport, timing, edit, zoom and xLights' fifteen single-letter effect shortcuts, with case significant as it is there (`o` is On, `O` is Off). A test asserts no two commands answer the same key - two matches means the second is unreachable and which one loses depends on list order rather than on a decision |
| Undo/redo | ⚠️ | Whole-body snapshots, not command-pattern inverses; a drag now snapshots once at drag start, not per pointermove (M10) |
| Perspectives | ✅ | Saved panel arrangements, stored per-browser like preferences and for the same reason. Applying one sets *every* panel rather than only the ones it lists, and saving over a name replaces rather than duplicating - two perspectives with one name are indistinguishable in the picker, which is the failure a picker exists to avoid |
| Preferences | ⚠️ | Time display format (minutes:seconds / seconds / frames), default effect length, snap-to-timing, and the autosave interval - every one of which drives something, with a test asserting none exists that nothing reads. Stored per-browser, not with the project |
| Autosave | ✅ | With ETag-based conflict detection (M7) |
| Timing tracks | ⚠️ | Rendered on a pinned ruler row, click-to-add/right-click-to-delete (M10). Fixed-interval and Metronome (BPM) generators added M15.6 (matches real xLights' New Timing dialog's 25/50/100ms and Metronome options - FPP Commands/Effects and tag data out of scope), each generating a new named track rather than overwriting one - a real imported sequence commonly has several meaningfully-named tracks (Beats, Lyrics, etc.) with no guaranteed ordering. All tracks still render merged onto one pinned ruler, not as separate rows like real xLights' Timings list (a larger `SequencerGrid.vue` rendering change, not attempted) - no lyric tracks |
| Copy/paste effects | ✅ | Via right-click context menu (M10); Cut and Duplicate too |
| Row (model/group) visibility | ✅ | A "Models" panel toggles which rows show on the grid, per sequence — a view preference (localStorage), not sequence data; doesn't touch which models/groups actually have effects (M15) |
| Waveform + playback | ✅ | Native `AudioContext`, peaks computed on main thread |
| Audio persistence | ✅ | Server-side, a Render persistent disk-backed Laravel disk; auto-restores on sequencer load, no manual re-select |

## Effects (SPEC ch7-9)

| Feature | Status | Notes |
|---|---|---|
| Effects implemented | ⚠️ | 44 of 55 named effects (adds Sketch, with a tracing canvas in the props panel - xLights' Effect Assist). Every effect renderable with what this engine has is now implemented; the remaining eleven need face/state definitions, DMX fixtures, shaders or video, all deliberate non-goals (On, Off, Bars, Candle, Life, Lightning, Color Wash, Fire, Meteors, Morph, Butterfly, SingleStrand, Snowflakes, Snow Storm, Spirals, Spirograph, Shape, Music, Fireworks, Tree, Lines, Tendrils, Twinkle, Shimmer, Strobe, Ripple, Wave, Pinwheel, Shockwave, Garlands, Curtain, Fill, Plasma, Galaxy, Fan, Marquee, Circles, Text, Pictures, VU Meter, Kaleidoscope, Warp, Adjust, Sketch). The full list, and which of the remaining 12 need infrastructure we don't have, is in docs/MANUAL-COVERAGE.md |
| Each implemented effect's default/common render path | ✅ | Faithful to the SPEC's math; rarer option combinations (alternate directions, other render methods, etc.) are per-effect documented ceilings — see DECISIONS.md M3/M6 notes |
| Per-effect Color palette | ⚠️ | Real xLights' Color tab: 1–6 swatches per effect (M15.3), editable via the Sequencer's effect panel, falling back to the app-wide default when unset. Multi-color blending across the palette (`multiColorBlend`) already existed for effects that use it; still missing real xLights' per-swatch checkboxes ("C"/"c" toggles), palette presets, and the "colors reflect music" audio-reactive option |
| Shader (ISF), Liquid, Glediator, Video, VUMeter | ❌ | Non-goal for v1 / no audio-reactive pipeline yet |
| Layer blend modes | ✅ | All 24, selectable per effect via the Sequencer's Layer Blending panel. The panel reads its list from the engine, so a mode can't be implemented and left unofferable the way all 10 originally were |
| "Mix" / Effect Mix Threshold slider | ⚠️ | The reveal/fade threshold some blend modes read - implemented since M3, wired to a UI slider in M15.4 (was hardcoded 0 everywhere) |
| Audio-reactive effects (VU Meter) | ⚠️ | 7 of ~20 VU Meter types (Spectrum, Volume Bars, Level Bar, Level Pulse, Level Color, Intensity Wave, Waveform), on an offline per-frame FFT of the loaded track. The analysis now actually reaches the renderer: the sequencer analyses a track once on load and hands the same series to the house preview, the popped-out preview and the .fseq export, so a meter renders identically in all three |
| Text effect | ⚠️ | Built-in 5×7 bitmap font only — no system font picker, outline/shadow options, or multi-line layout |
| Pictures effect | ⚠️ | Images stored in the sequence body, downscaled to 64px on the long edge (no asset store yet). Now actually loadable: a file picker and a pixel editor on the effect's image param - `decodeImageForEffect` had existed with no control anywhere, so an image could previously only arrive with an import |
| Shader (ISF), Liquid, Glediator, Video | ❌ | Non-goal for v1 |
| Layer blend modes | ✅ | 24 of 24 (the original ten plus 1/2 is Mask, 1/2 is Unmask, Shadow 1 on 2, Shadow 2 on 1, Layered, Brightness, **Canvas** — which isn't a way of combining two colours at all: the layer is handed what is underneath it to modify, and its output replaces that rather than blending over it, so a pixel it clears actually goes dark — plus **Bottom-Top** and **Left-Right**, which read the pixel's position along the axis, and **Morph**, whose cross-fade is driven by the position in the effect rather than by the Mix slider). **Suppress Until Frame** and **Freeze At Frame** are in too; they move or withhold the moment the effect renders at rather than changing how it combines. The manual documents these with screenshots rather than words, so the eight added follow what their names mean rather than a spec - see docs/MANUAL-COVERAGE.md |
| Layer settings: Transformation / Blur / Sub-buffer | ✅ | Rotate 90 either way, rotate 180, flip H/V; an alpha-weighted box blur; and a percentage sub-buffer, all applied between the effect and the model so they work on every effect |
| Layer settings: Render Style | ✅ | All of them — the six meaningful for a single model (Default, Per Preview, Single Line, As Pixel, Horizontal/Vertical Per Strand) and the fourteen that arrange a group's members into one shared buffer. Layers composite in node space rather than buffer space, so each layer can render into a differently-shaped buffer, which is what lets a group style hand an effect a buffer spanning several props |
| Layer settings: Roto-Zoom | ✅ | Rotation, zoom and pivot, sampled backwards from each destination pixel so a turn leaves no holes. Ground the turn uncovers stays transparent, so the layers beneath still show through |
| Layer settings: Persistent | ✅ | Scrubbing replays the effect's own frames into one buffer (capped at 600, so a long effect can't make a single scrub replay tens of thousands); the sequential export path keeps the buffer across frames it already walks in order. The two paths are tested frame-for-frame against each other |
| Effect presets | ⚠️ | Save an effect's whole configuration - params, palette (colour curves included), blend mode, mix, transition and layer settings - under a named group; apply it at the playhead on the selected row; import and export `.xpreset` files. Stored on the layout, since presets are global in xLights. A preset keeps a *duration* rather than a start and end, so applying it doesn't depend on where it was saved from. Missing: a preset spanning several layers or models at once, and xLights' Smart Presets |
| Views | ✅ | Named, ordered subsets of the sequencer's rows, picked from the toolbar. Stored on the layout rather than the sequence, per the manual's "views work across sequences" - so a view set up once is available in every sequence of the project. The order is the feature and is editable in place; a row a view names that the layout no longer has is skipped rather than left as a gap, which is what happens when a model is deleted after a view was saved. The Master View is the absence of a selection, since it is defined as every row |
| Colour curves | ✅ | Both kinds. Time-based curves resolve once a frame, so every effect gains them without knowing they exist. Spatial ones can't be — within one frame the swatch is a different colour in different places — so the layer is rendered at a few points along the curve's axis and each pixel taken from, or blended between, the renders nearest its own position: exact for any effect whose output is linear in its palette, which is nearly all of them, and close for the rest. Extra renders are only paid for by a layer that uses one. Gradient/None blending, all four directions, up to the manual's 40 markers, with a live gradient strip in the props panel |
| Value curves | ✅ | All 16 types (Flat, Ramp, Ramp Up/Down, Ramp Down/Up, Saw Tooth, Triangle, Sine, Abs Sine, Square, Parabolic Up/Down, Logarithmic Up/Down, Exponential Up/Down, Custom) with cycles/phase/reverse, a draggable point editor for Custom and six presets, reachable from the props panel on every VC-flagged param of every effect |
| Transitions | ✅ | 16 types (Fade, Wipe, Wipe Vertical, From Middle, To Middle, Square Explode/Implode, Circle Explode/Implode, Clock, Blinds, Slide Bars, Bow Tie, Star, Checkerboard, Ripple), in and out, each with its own type, duration and reverse, plus a pattern-density knob on the three types that read one - all set from the props panel's Transitions section |
| Buffer styles / sub-buffers | ✅ | Sub-buffer: an effect can be confined to part of a model, and is handed that smaller buffer to compose itself into rather than being cropped to it (the manual's own distinction). Render styles: all of them, single-model and group alike (see the Render Style row above) |

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

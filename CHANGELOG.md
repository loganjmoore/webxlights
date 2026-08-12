# Changelog

## M15 — Import/export verification, sequencer UX fixes, app-wide dark theme

Prompted by a request to verify import/export against real xLights files, check the Controllers
page's sizing/padding, polish the navbar/controls app-wide, confirm effect drag-and-drop works,
and add a way to manage which models show on the sequencer. No user-supplied xLights folder was
reachable in this remote session - checked `/mnt/attach` (empty) and the working tree; verified
against the repo's own real-format fixtures instead (`sample-rgbeffects.xml` + `sample.xsq`,
the latter a genuine EffectDB-ref-indexed file), stated plainly as the substitution it is.

- **Import verified live, end-to-end**: imported a layout, then a paired `.xsq` referencing its
  models by exact name - both models and effects landed with correct names and exact millisecond
  timing (`On` on Mega Tree 0-1000ms, `Bars` on Arch 1 200-1500ms, matching the fixture exactly);
  an unmatched model name in the fixture ("Random Effect Model") was correctly dropped, not
  phantom-rowed.
- **Export verified at the byte level**: triggered a real "Export .fseq" click, downloaded the
  actual file, and hand-checked every header field against the FSEQ v2 spec - magic bytes,
  `chanDataOffset`/`headerLen` self-consistency, channel count (3510, matching the sum of the
  three supported models' real node×byte math exactly), frame count (40, matching
  `2000ms / 50ms`), and total file size (140448 bytes = 48-byte header + 40×3510). No xLights/FPP
  install was available this session to open the file directly - stated as a real limitation of
  this verification, not glossed over as equivalent to it.
- **Fixed a real bug in effect placement**: arming a palette effect rendered a hint span that
  reflowed the whole palette bar ~90px taller, shifting the grid below out from under the user's
  cursor mid-interaction. This also produced a false "placement is broken" reading during initial
  testing (a stale pre-arm canvas-position read caused pointer events to land on nothing) before
  the actual reflow bug was isolated and fixed with an always-rendered, fixed-height hint area
  (`visibility`, not `v-if`).
- **Added real native HTML5 drag-and-drop for effects** (`SequencerGrid.vue`'s new
  `dragover`/`drop` handlers, `SequencerPage.vue`'s palette buttons now `draggable`) - drag a
  palette button straight onto the grid to place it at a default 1s length, resizable after. This
  is additive: the existing arm-then-drag-to-size gesture (real xLights' own placement model)
  works unchanged: two ways to the same result, matching `ModelPalette.vue`'s established
  drag-and-drop convention on the Layout page instead of being a second, different mechanism.
- **Added a "Models" panel** to the sequencer for showing/hiding which rows appear on the grid,
  with effect counts per row and Show-all/Hide-all. Persisted per-sequence in `localStorage` - a
  deliberate choice: this is a view/workspace preference, not sequence content, so it doesn't
  touch effects and doesn't need to round-trip through `.xsq` import/export or "package show".
- **Closed the white-background-inherited-from-the-Vite-template gap** (M13's original finding
  on `LayoutPage.vue`) across every remaining page: `ControllersPage.vue`, `SequencerPage.vue`,
  `AuthPage.vue`, `ProjectsPage.vue`, `SequencesListPage.vue`, `DocsPage.vue`. Also found and
  fixed a related, separate bug while doing this: dozens of plain `<button>` elements across the
  app had no explicit styling, rendering as a stray light-gray OS-default box against the new
  dark chrome - given consistent dark styling (background/border/hover) app-wide.
- **`ControllersPage.vue` spacing/padding pass**: uppercase letter-spaced table headers,
  consistent row/cell padding, a divider before "Assigned models" in the property panel, and a
  fixed display bug (`1–0` reading as a negative range for a zero-channel-count controller now
  shows `—`).
- Verified: `npm run lint && npm run typecheck && npm run test` all green (unchanged engine/
  formats surface, no new tests needed - this pass touched `apps/web` UI/UX, not engine math);
  `php artisan test` 27/27 (unchanged, no backend surface touched). The design detector
  (`impeccable`'s `detect.mjs`) ran clean against every changed page/component.

## M14 — Model rendering + import fidelity audit

Prompted directly by "ensure every model type looks like it should, ensure imported layouts
perfectly match" - an audit pass across every model's geometry and every placement attribute,
not a single scoped feature. Three real, independent rendering bugs found and fixed, plus a
real missing-feature gap (rotation/non-uniform-scale parsed since M1/M12 but never rendered)
completed:

- **Bounding-box estimate was wrong for most model types.** `LayoutCanvas.vue`/
  `LayoutCanvas3D.vue` used `ModelGeometry.width`/`.height` (buffer row/col counts, meant for
  effect rendering) as a stand-in for a model's on-screen size, for auto-fit, hit-testing, and
  the 3D pick mesh. That's only correct for types whose `screenX/screenY` literally equals
  `bufX/bufY` (Matrix). Circle/Star/Wreath normalize to a unit circle regardless of node count
  (rendered as a barely-visible speck next to a Tree); Tree's real width comes from
  `bottomTopRatio`, not `strings`; Window Frame's real extent is `top` x `leftRight`, not the
  perimeter node total. New `geometryScreenBounds` (`packages/engine/src/models/bounds.ts`)
  derives the real box from the nodes' actual rendered positions instead - one shared
  definition both 2D and 3D use, not two independent guesses.
- **Candy Canes' hook was an unreadable tiny wiggle.** The crook's curl radius was a hardcoded
  `0.5` local units regardless of pole length - invisible at any real node count (the pole is
  typically ~3x the hook's own node budget). Now scales with `crookNodes`, so the hook actually
  reads as a hook.
- **Icicles' no-`DropPattern` default was a straight line** - the one shape "icicles" can't
  look like. `computeIcicles`'s own no-pattern default (one drop spanning the whole node
  budget) is defensible as a library default, but `fromAttrs.ts`'s Icicles case (what a
  drag-created model or an import genuinely missing the attribute gets) now supplies a
  repeating short/long pattern by default instead.
- **Position/rotation/scale fidelity on import, completed.** Real xLights writes
  `WorldPosX/Y/Z` as a model's *center* (confirmed against the manual/community docs, not
  assumed) and pivots `RotateZ` around that same center - `ModelNode.screenX/screenY` is each
  shape's own natural local parametrization, frequently *not* centered on (0,0) (Icicles hangs
  entirely below its mounting line; Window Frame/Arches/Candy Canes sit in a single quadrant).
  New `packages/engine/src/models/transform.ts` (`geometryCenter`, `nodeWorldOffset`,
  `transformedHalfExtents`) is the one shared definition of "where a model's anchor really is"
  - both `LayoutCanvas.vue` and `LayoutCanvas3D.vue` now render through it, so they can't
  quietly disagree the way the pre-existing 2D/3D Y-flip convention already does. `RotateZ`
  (parsed and editable since M12, never rendered) and a new per-axis `screen.scaleY` (defaults
  to `scale`, so every existing single-scale model is unaffected) both actually render now, in
  both 2D and 3D. `LayoutPage.vue`'s position panel gets a Scale Y field.
- **A real regression caught only by testing an actual canvas click, not by screenshotting the
  result**: the bounds refactor above initially dropped a `* NODE_SPACING` factor `draw()`
  itself applies when placing nodes - every multi-model screenshot still looked correct because
  inter-model spacing dominated the computed auto-fit extent, masking a ~4x-undersized
  per-model hit-test box. Clicking a rendered model's own dots (verified via in-page canvas
  pixel sampling, not guessed screen coordinates) missed entirely until this was found and
  fixed - a reminder that "the screenshot looks right" isn't sufficient verification for
  anything with its own separate bounds computation.
- **Stated, not silent**: rotation's sign convention (counter-clockwise-positive in a Y-up
  system) is internally consistent between 2D and 3D but not verified against real xLights'
  own `RotateZ` handedness - no reference file with a known before/after render was available
  this session. Per-type shear (Angle/Shear/Height for the 3-point line placement system, X2/Y2
  for 2-point) is still not applied - a real remaining gap on top of the universal Pos/Scale/
  RotateZ trio every model now gets.
- Verified live: all 11 draggable palette types re-screenshotted individually post-fix (correct
  shapes, correct relative scale - Circle/Star/Wreath now fill the canvas like Tree/Matrix
  instead of rendering as a speck); a hand-built realistic fixture (a tree, two rooflines
  rotated ±20°, and a window frame scaled 2x/0.5x non-uniformly) rendered as a coherent house
  layout in both 2D and 3D, wireframe selection box aligned exactly to the rendered points; a
  rotated line's own rendered pixels (sampled from the live canvas, not assumed) correctly
  selected the right model on click. `packages/engine`: 14 new tests (`bounds.test.ts`,
  `transform.test.ts`) - 124 total, all passing.

## M13 — Layout visual parity + model placement toolbar

- New `apps/web/src/components/ModelPalette.vue`: a drag-source toolbar of the 11 model types `computeGeometryFromAttrs` already has real defaults for (Matrix, Single Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath — Custom excluded, see below). Native HTML5 `draggable`, no new dependency.
- `LayoutCanvas.vue` gets `@dragover.prevent`/`@drop` on its `<canvas>`, inverting the drop point through the exact same `computeTransform`/`toWorldX`/`toWorldY` its pointer-drag path already uses, and emits `create: [type, x, y]`. `LayoutPage.vue` turns that into a `bulkUpsertModels` call with an auto-numbered name (`Tree-1`, `Tree-2`, ...) and `raw_attrs: {}` — the engine's own fallback defaults for every draggable type render exactly like a real xLights "place with defaults" model.
- New `DELETE /v1/layouts/{layout}/models/{model}` (`ModelEntityController::destroy`, editor-authorized) + `api.deleteModel()` + a Delete-key/button on the position panel — the necessary complement to create, since there's no structural-param editor yet to fix a wrong drop any other way. Inline double-click rename on the model-list sidebar (reuses the existing `update` endpoint's `name` field, no backend change).
- `LayoutPage.vue`'s own chrome (header, sidebar, position panel) gets a dark theme (`#0d0d11`/`#16161c`, existing `#e8c468` gold accent unchanged). Found by live screenshotting, not by reading code: the page had inherited the Vite template's white-background/56px-`<h1>` defaults, starkly unlike every real xLights screenshot referenced in `NEXT-MILESTONES.md`. Scoped to this page only — `AuthPage.vue`/`ProjectsPage.vue` untouched.
- **Real pre-existing bug found and fixed the same way**: `packages/engine/src/models/tree.ts`'s cone radius formula (`1 * heightT + (1/bottomTopRatio) * (1 - heightT)`) put the *narrow* radius at the buffer-bottom and the wide one at the top — every Tree model rendered as an inverted needle, not a tree. One-line fix (`bottomTopRatio * (1 - heightT)`, matching the param's own doc comment); no existing test locked in the wrong direction, all 110 `packages/engine` tests still pass. Confirmed via a pixel-column measurement of a live screenshot, not just eyeballing (a thumbnail-scale render of a "Round" tree's wobble is easy to misread).
- **Explicit cuts, stated not silent** (see `GOAL-M13.md`): Custom excluded from the palette (a dropped one with `raw_attrs: {}` would be geometry-less forever — needs a real grid editor, out of scope); drag-to-place uses fixed engine defaults, not real xLights' drag-to-size gesture; palette is 2D-only (3D creation would need ground-plane raycasting from a native drag event, a different mechanism); no per-type structural-param editor (string count, node count, degrees, ...) — only screen transform is editable after creation.
- Verified live end-to-end (sqlite-backed local run — this session had no Docker daemon, Postgres stays the real/deployed DB): dragged all 11 types onto the 2D canvas, each landed at the drop point, appeared in the model list, and survived a full reload; renamed and deleted models persisted correctly; imported a real `xlights_rgbeffects.xml` fixture and confirmed Tree/Matrix/Arch/Single-Line all render at visually consistent scale next to freshly-dropped models, in both 2D and 3D. PHPUnit feature tests added for the new `destroy` endpoint (delete + cross-layout 404), mirroring `LayoutModelsTest.php`'s existing pattern.

## Fix: nginx 413 on large uploads (mid-M12)

nginx defaulted to a 1MB `client_max_body_size`, well under what a real `xlights_rgbeffects.xml` import needs and under `SequenceController`'s own 50MB audio upload limit - a real user-reported blocker, not something an import-flow test would catch since local dev's `php artisan serve` has no such limit. Set to 100M. Verified live: a 1.25MB bulk-import payload that previously 413'd now returns 201.

## M12 — Layout editing: 2D first, then 3D

- `apps/web/src/components/LayoutCanvas.vue` was a pure read-only `draw()` with zero pointer listeners since M1 - now inverts its own world-to-screen transform for hit-testing and drag: pointerdown hit-tests each model's drawn bounding box, pointermove updates a local live position (no network calls mid-drag), pointerup makes the **first real call to `api.updateModel()`** anywhere in the app. `LayoutPage.vue`'s `updateScreen()` always spreads the model's existing `screen` object before overriding the changed keys - `ModelEntityController::update` replaces `screen` wholesale, not a deep merge, so this is the one thing that had to be right.
- `screen` grows a `z` field (`{x, y, z, scale, rotate}`, no migration needed - jsonb, no shape enforcement). `import.ts`'s `extractScreenPosition()` now reads `WorldPosZ` the same way it already reads `WorldPosX/Y`.
- `LayoutPage.vue` gets a 2D/3D toggle and a position panel (X/Y/Z/Scale/Rotate, editable, same "select on the left, edit on the right" pattern as `EffectPropsPanel.vue`). The model-list sidebar stays the primary selection mechanism in 3D - list-click and canvas-click both select, and stay in sync (list highlight + a 3D wireframe box outline).
- New `LayoutCanvas3D.vue`, sharing scene/camera/renderer bootstrap with `HousePreview.vue` via an extracted `sceneSetup.ts` helper instead of duplicating it (`HousePreview.vue` refactored to use the same helper, behavior unchanged). Per-model picking is one invisible `Box3`-derived `Mesh` per model (`points.raycast = () => {}` disables picking the shared `Points` cloud directly - `sizeAttenuation: false` makes that camera-distance-dependent and unreliable, per the documented trap). `OrbitControls` for the camera, `DragControls` for move (the smaller MVP over `TransformControls` - a plane-drag gizmo is a legitimate fast-follow once translate is proven out, not this milestone's job).
- Verified live: dragged a model in 2D, exact world-space delta matched the screen-space drag distance scaled by the fit transform, scale/rotate untouched. In 3D: orbited the camera, selected via both the list and a raycast click on the canvas (synced both ways with a visible wireframe highlight), dragged a model via `DragControls`, edited X/Y/Z/Scale/Rotate directly in the position panel - every path persisted through the same `updateScreen()` call and survived a full page reload with scale/rotate/z intact.
- **A real bug caught only by live browser testing, not by code review**: synthetic `PointerEvent`s dispatched via `dispatchEvent()` don't carry a browser-tracked pointer session, so `DragControls`' internal `setPointerCapture()` call throws `DOMException` against them - harmless against real user input (which always has one), but it meant the automated verification pass for 3D drag needed `Element.prototype.setPointerCapture` stubbed out to exercise the same code path a real mouse drag takes. Not a shipped-code bug; noted because the failure mode (M9's global error banner catching it) is worth recognizing if it resurfaces.
- **Explicitly not this milestone** (see DECISIONS.md): textured/image-mapped node rendering (`HousePreview.vue` stays flat `THREE.Points`, a rendering-fidelity gap, not a layout-editing one), mesh/GDTF objects, per-preview cameras, rotate/shear via a 3D gizmo (translate only), multi-select.

## M11 — Controllers

- `apps/api`: a real `controllers` table (name, protocol, ip_address, start_channel, channel_count, vendor, model, active) and full CRUD (`ControllerController`, aliasing `App\Models\Controller` to dodge the base-`Controller`-class collision — hit this same trap a second time inside `ModelEntityController.php` after adding the validation import there, see DECISIONS.md). `models` gets nullable `controller_id` (FK, `nullOnDelete`) and `controller_offset`. `ModelEntityController::update` rejects `controller_offset + channel_count > controller.channel_count` with a 422 before saving — `channel_count` is computed client-side (same `computeGeometryFromAttrs` call `fseqExport.ts` already used, exported as `channelCountForModel()`) and submitted with the assignment; the server enforces the size constraint arithmetically without porting the geometry engine to PHP.
- `apps/web`: `ControllersPage.vue` (table + "select on the left, edit on the right" property panel, matching `EffectPropsPanel.vue`'s convention) at `/projects/:id/controllers`, linked from the Layout page header. "Add USB"/"Add Ethernet"/"Add Null" buttons — DDP is "Add Ethernet" with protocol defaulting to `ddp` (this MVP's new-controller default differs from the reference screenshot's E1.31 default, a stated divergence since E1.31 isn't implemented). `LayoutPage.vue`'s model sidebar gets a controller-assignment dropdown + offset input per model.
- `fseqExport.ts` rewritten for real controller-routed addressing: `byteIndex = controller.start_channel - 1 + controller_offset` for assigned models; unassigned models keep writing sequentially starting right after the highest controller-routed span (`controllerSpanEnd`), not from byte 0. **This is a real, stated behavior change**: the moment any controller exists and has models assigned, unassigned models' byte positions shift from the pre-M11 offset-0 start. `frame.set()` calls wrapped in try/catch, surfaced via a new export-error banner in `SequencerPage.vue` (there was no error handling on the Export button at all before this).
- 4 new PHPUnit tests (CRUD + auth, an in-bounds assignment, an over-bounds assignment rejected with 422) — 25 total, green.
- Verified live: created a DDP controller, hit the 422 boundary intentionally (a 2400-channel model against a 300-channel controller), raised the controller's channel count, assigned two 2400-channel models at offsets 0 and 2400, exported, and parsed the real output bytes back — model A's bytes land at offset 0, model B's at exactly 2400 with a clean non-overlapping boundary, and the unassigned third model's bytes start at 5000 (`controllerSpanEnd`), for a total `channelCount` of 7400 matching the formula by hand. Deleting a controller correctly nulls out its models' `controller_id` (`nullOnDelete`), no orphaned FK.
- **Deferred, one set with one reason** (see DECISIONS.md): E1.31 universe math (Start Universe/Universe Count/Channels-per-Universe) and every field that only matters once real network output exists (Monitor, Suppress Duplicate Frames, Multicast, FPP Proxy IP, Discover, Upload Input/Output, the global-settings block) — still behind the same "browsers can't do raw UDP" ceiling as M8. `xlights_networks.xml` import — no parser exists for it in `packages/formats`; manual entry unblocks the export win immediately without one.

## M10 — Sequencer interaction parity

- `apps/web`: `SequencerGrid.vue` now renders `body.timingTracks` on a pinned ruler row above the effect rows (`HEADER_HEIGHT`, threaded through both the row-draw loop and `hitTest()` so a click and its drawn row agree on which row it hit). Left-click empty ruler space adds a mark; right-click an existing mark or empty ruler space opens a context menu (Delete Mark / Add Timing Mark Here).
- Left-edge resize handle mirrors the existing right-edge one (`col-resize` cursor over either edge, `grab`/`grabbing` mid-drag). Move and resize both snap to the nearest timing mark within 6px.
- New `EffectContextMenu.vue`: right-click an effect for Copy/Cut/Paste/Duplicate/Delete (fixes the pre-existing "paste always goes to row 0" bug for free, since the menu knows which row was right-clicked). Right-click empty space on a model row shows no menu (placement already has its own gesture). Clamped to stay on-screen when opened near a viewport edge.
- Two real bugs fixed in the same code, not follow-ups: horizontal zoom/scroll was broken (`SequencerGrid`'s canvas was container-width, not `duration * pxPerMs`, so effects past the right edge were unreachable at 2x zoom) — both `SequencerGrid` and `Waveform` now size to the real content width and share one `.h-scroll` wrapper in `SequencerPage.vue` so they scroll together. And undo used to snapshot on every `pointermove` during a drag, filling the 100-entry stack with intermediate frames so Ctrl+Z nudged by a pixel instead of undoing the move — the store now snapshots once at drag start (`store.snapshot()`) and drag frames apply via a new no-snapshot `updateEffectLive()`.
- A real bug caught only by live verification, not code review: `.grid-scroll-viewport`'s `overflow-y: auto` with no explicit `overflow-x` computes `overflow-x` to `auto` too per the CSS spec, silently creating a second, narrower horizontal scroll container that clipped the widened canvas before the page's shared scroll wrapper ever got to scroll it. Fixed with an explicit `overflow-x: visible`.
- Verified live: placed effects via direct pointer-event sequences (browser automation's synthesized drag didn't reliably reach the canvas's own pointer handlers at this viewport size, confirmed separately with an in-page dispatch harness) — left-edge resize snapped exactly to a mark, a 12-step pointermove drag undid in one Ctrl+Z back to the exact pre-drag position, the context menu's Duplicate/Delete-Mark/Add-Timing-Mark-Here actions round-tripped through the API, and 2x zoom plus a manual scroll revealed effects and marks that were unreachable before the fix.
- **Out of scope, stated not silent**: effect-type glyphs on effect bars (sparkle/photo/emoji/chart icons in the reference screenshots) — visual parity, not interaction parity; multi-select/multi-drag — cut per `NEXT-MILESTONES.md`, touches selection state and hit-testing for a workflow the reference screenshots don't show.

## Audio persistence (pre-M10)

- `apps/api`: a Laravel `audio` filesystem disk (auth-gated, `serve: false`, never public), a `sequences.audio_path` column, `POST /v1/sequences/{sequence}/audio` (replaces any prior file, deletes the old one) and `GET /v1/sequences/{sequence}/audio` (re-checks project access before streaming). Fixes the real R2 blocker noted in M9's handoff: a Render persistent disk (`webxlights-audio`, 5GB, mounted at `/var/data`) replaces the abandoned R2 plan, `AUDIO_STORAGE_PATH=/var/data/audio` on the live service.
- `apps/web`: creating a sequence and manually re-picking a file both auto-upload to the new endpoint; on sequencer load, a stored `audio_path` is fetched and fed through the existing `decodeAudioData` path so the browser never needs to re-prompt for the file after a reload.
- Dockerfile: the persistent disk mounts owned by root on a fresh container, so the entrypoint now `chown`s `/var/data` to `www-data` before starting php-fpm, or the audio disk write fails.
- 3 new PHPUnit tests (upload + fetch, re-upload replaces and deletes the old file, cross-user access denied) — 21 total, green.
- Verified live: opened a sequence with a stored `audio_path`, no manual file picker shown, waveform rendered, `<audio>` element sourced from the fetched blob with a real nonzero duration.

## M9 — Hardening + parity harness + docs (reduced scope)

- `packages/engine`: fixed a real O(n²) perf bug found while writing the M9 perf test — full-sequence rendering replayed every stateful effect (Fire/Meteors/Snowflakes/Strobe) from its start on every frame, so a full export with one of those effects redid all prior frames on every step. `createRowSequencer()` carries each effect's own state incrementally across a sequential sweep instead (byte-identical output, verified against the old function frame-by-frame in `test/rowSequencer.test.ts`), turning the ROADMAP's 20k-channel/3-minute benchmark from a near-timeout into ~6.2s (`test/perf.test.ts`, a permanent regression guard). Wired into `apps/web/src/lib/fseqExport.ts`, replacing the old per-frame call — every real "Export .fseq" click now benefits.
- `apps/web`: `SequencerGrid.vue` is now a real virtualized viewport — fixed-height canvas + scrollable spacer, only rows in the visible scroll range are drawn, so cost stays flat past the 100-row/5k-effect budget instead of growing with total row count.
- `apps/web`: a last-resort error banner (`lib/errorTriage.ts`) for uncaught errors and unhandled promise rejections — works even if Vue's own runtime is what broke, since it touches the DOM directly rather than going through a component. There wasn't one before; an uncaught error just left the page silently frozen.
- `apps/web`: an onboarding sample project (`lib/demoProject.ts`) — one click from the empty projects page creates a small layout, a pre-built sequence with effects already placed, and a synthesized demo audio clip (WAV-encoded client-side; not a licensed track — see DECISIONS.md), landing straight in a working sequencer with zero manual file handling. `/docs` adds an import guide and an effect reference generated live from `EFFECT_SCHEMAS`.
- `PARITY.md`: a feature-by-feature xLights-vs-webXLights table linking SPEC chapters, built from nine milestones' worth of documented ceilings.
- Verified live end-to-end: signup → Load sample project → sequencer with audio/preview/effects already there → Export .fseq, no manual steps; grid virtualization tested with a 25-model project (scroll + place-on-a-scrolled-row both correct).
- Scoped down from the full M9 ask: OPFS spill (nothing in this project is close to the size that would need it), the worker-pool/SharedArrayBuffer render architecture (measured single-threaded perf is already inside budget; the full architecture is a genuinely large undertaking this pass didn't have room for), and a real `xLights --headless` determinism harness (no xLights install available in this environment to compare against) are honest, documented gaps in DECISIONS.md and PARITY.md, not silently skipped.

## M8 — FPP Connect (Chromium path)

- `apps/web/src/lib/fppConnect.ts`: Chromium/LNA detection (`userAgentData` Client Hints + UA fallback, correctly includes Edge as Chromium-derived); `getFppSystemInfo` (host verification via `GET /api/system/info`); `uploadFseqToFpp` (legacy `POST /api/file/uploads/<name>` + `GET /api/file/move/<name>`, Content-Type only per the goal prompt's exact instruction); `syncPlaylist` (GET-merge-POST of `/api/playlist/<name>` matching the SPEC's documented JSON shape byte-for-byte, including `total_items`/`total_duration` recompute and `random:0`).
- `apps/web`: an "FPP Connect" panel on the sequencer page — host input + Connect (verifies + shows HostName/Version/Mode), playlist name + Upload to FPP (reuses M5's `exportSequenceToFseq` unchanged). Non-Chromium browsers see a guided-download message instead, pointing at the existing Export .fseq button. Gated by a single `FPP_CONNECT_ENABLED` flag; Export .fseq is a fully separate code path, so this never blocks it.
- Verified live against a mock FPP HTTP server (no real hardware available, same as M5's fseq-format verification without physical playback): connected and got back the mock's HostName/Version/Mode; uploaded a rendered sequence and confirmed a byte-valid PSEQ file landed server-side; synced a playlist and confirmed the resulting JSON matches the SPEC's `/api/playlist/<name>` shape exactly.
- Scoped to exactly what the goal prompt asked (SPEC ch16 §3.2): the legacy upload path only (not FPP 7+'s chunked PATCH, which the SPEC itself notes fails FPP's current CORS preflight), no config/outputs/models sync, no discovery beyond a user-entered host (browsers can't receive FPP's UDP multicast ping) — recorded in DECISIONS.md.

## M7 — Versioning, sharing, autosave hardening, package show (reduced scope)

- `apps/api`: `sequence_versions` (immutable snapshots) and `project_members` (viewer/editor roles) tables. `Project::authorize(User, need)` is the single access-control gate now used by every controller (projects/layouts/models/model-groups/sequences) in place of six separate `owner_id === user()->id` checks — closes M7's sharing requirement without duplicating the rule anywhere. `sequences.revision` (a plain incrementing int, not a timestamp) backs an `etag`/`If-Match`-style conflict check on the autosave endpoint: a stale `if_match` 409s with the current server state instead of silently overwriting someone else's save.
- `apps/api`: `SequenceVersionController` (snapshot/list/restore, editor+ required to write, restore bumps `revision` so open tabs' stale etags still get caught), `ProjectMemberController` (owner-only invite-by-email/list/remove).
- `apps/web`: a "Snapshot" + "History" panel on the sequencer page (creator name, timestamp, one-click Restore); a "Share" panel on the projects page (owner-only, email + viewer/editor); a conflict banner on autosave 409s with "keep mine" / "take theirs"; "Export package" / "Import package (.zip)" buttons implementing a webXLights-native portable zip format (`manifest.json` + one JSON body per sequence) via `jszip` — a new dependency, since there's no native or already-installed way to write a zip client-side.
- Fixed a real bug found only by testing the full flow live: `AuthController::logout()` 500'd (has since M0 — no logout button existed, so nothing ever exercised it) because `Auth::logout()`'s bare guard resolution gets hijacked by Sanctum's per-request `shouldUse()` call. Added a "Log out" button (there wasn't one) and a regression test.
- Verified live with two real accounts end-to-end: owner shares a project as editor, editor sees it in their project list, edits a sequence body (viewer is correctly rejected with 403), snapshots and restores a version (creator attribution correct), and a stale-etag save correctly 409s instead of clobbering (PHPUnit); exported a project to a zip and re-imported it into a fresh project, confirming the sequence's name/frame_ms/duration_ms/audio_filename/body all round-tripped exactly (browser, live) — the exact M7 accept criterion.
- Scoped down from the full milestone ask: no Reverb live presence ("locked by", avatars — needs a new paid Render service plus real two-session testing to be worth building), no quota guards (nothing to guard against yet), package show is a client-side zip in a webXLights-native format rather than a queue-job-produced xLights-XML zip (same "ship the zero-infra version first" call M5 made for fseq/xsq) — recorded in DECISIONS.md.

## M6 — Effects wave 2 + curves + transitions (reduced scope)

- `packages/engine`: 5 new effects — Strobe (stateful particle pool), Ripple (Old/Circle), Wave (Sine), Pinwheel (New Render Method), Shockwave — bringing the total to 15 implemented effects. All wired into `renderRowAtMs` and `EFFECT_SCHEMAS`, so they're placeable and editable in the M2 sequencer UI immediately (verified live: all 15 appear in the effect palette).
- `valueCurve.ts`: a `ResolveParam`/`ValueCurve` mechanism (one type, `Ramp` = linear interpolation over the effect's duration) applied to `On`'s `transparencyPct` as a proof of the pipeline end-to-end — a param can now hold a flat number or a curve object and effects resolve it per-frame.
- `transition.ts`: `applyFadeTransition` — a per-layer Fade In/Out wired into the frame-render pipeline via an optional `transition` field on `RenderableEffect`.
- 25 new tests (106 total in `packages/engine`): golden/structural + determinism checks for all 5 new effects, plus dedicated value-curve and transition suites.
- Explicitly scoped down from the full milestone ask (15 effects → 5, one VC type → not the full editor, Fade only → not Wipe/From Middle/Circle Explode, no VUMeter) — recorded in DECISIONS.md as a milestone-level scope decision, not silently claimed as complete.

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

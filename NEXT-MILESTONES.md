# webXLights — M10/M11/M12 build spec

Written 2026-08-10, from six of Logan's reference screenshots of the real xLights desktop
app (Controllers tab list + property panel, Layout tab 3D mode, Sequencer timeline, a
popped-out House Preview window idle and mid-playback). Reviewed by three independent
adversarial passes (technical feasibility, xLights UX-parity vs. the screenshots, scope
discipline against this repo's own house style) before this version. Every claim below about
current repo state was verified against the actual files, not assumed from ROADMAP/DECISIONS
prose — see "Corrections from review" at the bottom for what the first draft got wrong.

Three **independent** milestones, not sub-parts of one — this repo's own history (M6, M7 in
CHANGELOG.md) shows a full ask is often too big for one pass, and these three genuinely don't
depend on each other:

- **M10 — Sequencer interaction parity.** Cheapest, most self-contained, fixes things that
  are already half-wired (timing marks are stored but never drawn; right-edge resize already
  works). Closest to a bug fix wearing a milestone's clothes.
- **M11 — Controllers.** New table, new page, a real export-algorithm change. Highest
  ceiling-value — it's what actually changes what gets sent to FPP.
- **M12 — 2D + 3D layout editing.** The most speculative: this codebase has never shipped
  *any* layout editing (2D drag-to-reposition has been a documented M1 ceiling through M9).
  Reframed below to build that first, cheaply, before 3D.

**If only one ships, ship M10.** It's the ladder's "already solved, just needs plumbing" rung
— no migration, no new page, no new interaction model, zero real file overlap with the other
two. M11 and M12 both touch `LayoutPage.vue` (M11 adds a controller-assignment field to the
model sidebar, M12 adds a 2D/3D toggle and mounts a new canvas) — not a conflict, since they
touch different regions of a 57-line file, but not the "zero overlap" the first draft claimed
either.

---

## M10 — Sequencer interaction parity

**Problem, precisely:** `SequencerGrid.vue` never reads `body.timingTracks` — marks are
stored (`t` key → `store.addTimingMark`) but never drawn. There's no context menu anywhere
in the app. Effect resize only works on the right edge. Two more real bugs surfaced by
review, worth fixing in the same pass since they sit in exactly the code this milestone
touches:

- **Horizontal zoom/scroll is already broken.** `durationMs` is a declared prop
  `SequencerGrid.vue` never reads; the canvas is only container-width, not
  `duration * pxPerMs` wide. At 2x zoom, effects past the right edge are drawn nowhere and
  are unreachable. A milestone called "interaction parity" that ships snap-to-mark while you
  still can't scroll to minute 3 of a song is a bad trade — fix the canvas width formula here.
- **Undo already breaks on drag.** `store.updateEffect` snapshots on *every* call, and
  `onPointerMove` calls it per pointer-move event during a drag — one drag fills the entire
  100-entry undo stack with intermediate frames, so Ctrl-Z after a move nudges by a pixel
  instead of undoing the whole drag. Fix: snapshot once on `pointerdown`, not per move. Small,
  and this milestone is about to add a second drag path (left-edge resize) that would inherit
  the same bug if left alone.

### 1. Render timing tracks

`body.timingTracks` is already an array — today it holds one auto-created "Marks" track, and
that's genuinely all this milestone needs to make visible; multi-track add/rename/delete UI
is a second, unasked-for feature and is cut (M2's own ceiling note already says "manual marks
only," singular track).

- A **pinned** ruler row above the model/group rows (xLights pins its timing row; it doesn't
  scroll away with content). This is a real coordinate-system change, not an additive draw
  call: `SequencerGrid.vue`'s row math (`firstRow = floor(scrollTop/ROW_HEIGHT)`,
  `y = i*ROW_HEIGHT - scrollTop`) assumes a uniform `ROW_HEIGHT` with no header, and
  `hitTest()` / `onPointerDown` both independently compute the same row index — both need a
  `headerHeight` subtracted, in both places, or they'll disagree about which row a click hit.
- Marks draw via the same `msToX`/`pxPerMs` prop the effect rows already use (confirmed: this
  part of the original claim was right — `pxPerMs` is a real prop, not recomputed
  independently, so horizontal alignment is free).
- `SequencerGrid.vue` has no store access by design (props/emits only, matching
  `handlePlace`/`handleMove`/`handleSelect`'s existing pattern) — clicking a timing row
  **emits** `addMark`/`deleteMark`, `SequencerPage.vue` calls the store, exactly like every
  other mutation today. The grid doesn't call `store.*` directly anywhere, and this shouldn't
  be the first place it starts.
- Right-click an existing mark: emit a delete; add `store.deleteTimingMark(trackIndex, ms)`
  (trivial array splice, mirrors `addTimingMark`).

### 2. Effect drag/resize, finished

- Left-edge resize handle mirroring the existing right-edge one (`nearRightEdge` →
  `nearLeftEdge`, same 6px threshold, clamps `startMs`, same 50ms minimum span).
- `col-resize` cursor over either edge, `grab`/`grabbing` mid-drag.
- Snap-to-timing-mark on move/resize: within ~6px of any mark across all timing tracks,
  snap to it. Without this, marks that are now visible but don't attract anything reads as
  broken, not as a feature, once #1 ships.
- Multi-select/multi-drag: still cut. Touches selection state, undo-snapshotting, and
  hit-testing all at once for a workflow that isn't what the screenshots show — single-effect
  move/resize plus the new left handle covers it.

### 3. Right-click context menu

New `EffectContextMenu.vue`, an absolutely-positioned `<div>` at the click point — the only
existing pattern for a floating panel in this app (palette/props panel: plain unstyled divs,
no popover library, none needed for one menu). `SequencerGrid.vue` adds a `contextmenu`
listener (`preventDefault()`, hit-test the same way `onPointerDown` already does) and emits
**`{ row, effect, x, y }`** on a hit — `row` is included because Duplicate/Paste both need it
(`pasteEffectAt(elementType, elementId, ...)`), not just `effect`; a payload without `row`
can't actually drive them despite looking like it reuses existing methods.

- **Copy** → `store.copyEffect`. **Cut** → `copyEffect` + `deleteEffect` in sequence (there's
  no `cutEffect` method — Cut is those two calls, not a new mutation). **Paste** →
  `store.pasteEffectAt(row's elementType/elementId, ms)` — this also fixes the existing
  "paste always goes to row 0" bug for free, since the menu knows which row was right-clicked.
  **Duplicate** → copy + paste at a small time offset on the same row. **Delete** →
  `store.deleteEffect`.
- The clipboard stays a `ref` owned by `SequencerPage.vue` (as today) — the context menu emits
  action names (`"copy" | "cut" | "paste" | "duplicate" | "delete"`) and the page performs the
  mutation, same ownership boundary as everything else.
- Right-click empty space on a timing-track row → "Add Timing Mark Here." Right-click empty
  space on a model row → no menu (placement already has its own gesture: armed palette + drag).
- Closes on: item click, click-elsewhere, `Escape`.

### Verification

**No vitest exists in `apps/web` today** (root `npm test` only runs `packages/engine` and
`packages/formats`; there are zero test files under `apps/web`). Standing up a frontend test
runner is real, separate infrastructure work this milestone doesn't need to invent for itself
— match this repo's actual established pattern instead: verify live in the browser (screenshot
+ interaction trace), the same way M2/M3/M4's "verified end-to-end in-browser" bullets already
document real UI work in this codebase. If a pure, easily-testable function falls out of the
hit-test/snap math naturally, export it so a future test pass can pick it up for free — don't
build a test harness around it just for this milestone.

**Acceptance:** timing marks visible, click-to-add and right-click-to-delete work and stay
pixel-aligned with effect bars while scrolling; an effect resizes from either edge with visible
cursor feedback and snaps within 6px of a mark; right-click opens a working menu for all five
actions including on a non-first row; zoomed-in content past the old container-width clip is
reachable by scroll; a multi-step drag undoes in one Ctrl-Z. All verified live, screenshotted.

**Out of scope, stated not silent:** effect-type glyphs on bars (screenshot 4's sparkle/
photo/emoji/chart icons) — a visual-parity item, not an interaction-parity one; separate
follow-up.

---

## M11 — Controllers

**Problem, precisely:** no controller/universe/channel model exists anywhere in the repo.
`models.start_channel` is a free-form string captured on import and never parsed.
`fseqExport.ts`'s frame buffer is a running-cursor concatenation in layout-import order.

### Scope: DDP first, not full E1.31 universe math

DDP has no 512-channel-per-universe ceiling (one controller = one flat channel span); E1.31/
Art-Net pack channels into 512-byte universes with their own start-channel math. Building both
at once roughly doubles this milestone's real complexity for a feature with zero live-output
consumer yet (browsers still can't do raw UDP — unchanged ROADMAP non-goal). 5 of 6 saved
controllers in the reference screenshot are DDP; the MVP covers those directly. One honest
caveat: the *new-controller* flow in the reference defaults to Protocol = E131 — this MVP's
new-controller default will differ from that exact screenshot (defaults to DDP/Ethernet), which
is a stated UI-level divergence, not a scoping mistake.

### Data model

```
controllers: id, project_id, name, protocol (ddp|ethernet|null|usb),
             ip_address (nullable), start_channel (int, default 1, user-authoritative —
             see Export below), channel_count (int), vendor (nullable), model (nullable),
             active (bool, default true)
```
No `order` column — nothing in this milestone's UI ever sets or reads one (controllers are
added one at a time; channel allocation is keyed by `start_channel`, not creation order); add
it back only when a real reorder UI is asked for.

`Controller` Eloquent model + `ControllerController` HTTP controller (`index`/`store`/`update`/
`destroy` — this repo has no existing full-CRUD example to copy verbatim; `destroy` is real
scope here because the property panel gets a Delete button, not a speculative endpoint).
**Naming trap:** `App\Http\Controllers\Controller` is the abstract base every HTTP controller
extends — `ControllerController` referencing `App\Models\Controller` in the same file needs
`use App\Models\Controller as ControllerModel;` or it collides with its own parent class.
Routes under the existing `v1` group, `Project::authorize()` reused (same pattern as every
other project-scoped resource).

`models` table: add `controller_id` (nullable FK, `nullOnDelete`) and `controller_offset`
(nullable int, 0-based — this model's byte offset *within* the controller's span). The
existing free-form `start_channel` string stays untouched (still imported, still shown
read-only — changing its meaning would break the M1 importer's contract). Server-side
validation on model update: reject `controller_offset + model's channel byte count >
controller.channel_count` with a 422, so a bad assignment fails at save time with a clear
message instead of crashing export later.

### UI

`ControllersPage.vue`. Table: Name / Protocol / Address / Channels / Vendor / Model (drops
"Universes/Id" and the truncated "Variable Modules" column — xLights-internal concepts this
MVP doesn't model, dropped rather than faked). "Add USB"/"Add Ethernet"/"Add Null" buttons
matching the reference exactly — DDP is "Add Ethernet" with Protocol set to DDP afterward in
the property panel, not a fourth button (verified: this is how the reference screenshot itself
represents its DDP controllers too).

Selecting a row opens a property panel on the right — same "select on the left, edit on the
right" convention `EffectPropsPanel.vue` and this same milestone's own table both use: Name,
Protocol, IP Address, Channel count, Start channel, Vendor, Model, Active toggle, a read-only
list of models currently assigned to it (derived from `models.controller_id`, not a stored
field), and a Delete button.

**Explicitly deferred, as one set with one reason, not cherry-picked:** Start Universe/
Universe Count/Channels-per-Universe (the E1.31 fields, per the DDP-first call above); and
separately, Description/Auto Size/Monitor/Suppress Duplicate Frames/Multicast/FPP Proxy IP/
Force Local IP/Priority/Managed, plus the screenshot's global-settings block (Controller Sync,
Max Duplicate Frames To Suppress, Global Force Local IP, Global FPP Proxy) and its bottom
button row (Visualise, Upload Input/Output, Discover, FPP Connect's controller-specific button,
Open Proxy) — every one of these only matters once real network output exists, which is the
same "browsers can't do raw UDP" ceiling this whole milestone already sits behind. Building
them now would be decorative fields with no function; deferred together rather than picked
off one at a time so the reason stays legible.
- `xlights_networks.xml` import (auto-populate controllers from a real xLights install) — no
  parser for this file exists anywhere in `packages/formats` (only `fseq.ts`/`rgbeffects.ts`/
  `xsq.ts`). Manual entry (what the reference screenshot shows Logan actually doing) unblocks
  the export win immediately without it — same "ship the zero-infrastructure version first"
  call this codebase already made twice (fseq export, package show).
- Actual live network output, controller auto-discovery — still blocked on browser UDP.

### Export

**One addressing scheme, `start_channel` authoritative** (not an auto-allocated running
offset — that would make the user-edited `start_channel` field a lie, and it's the field the
reference screenshot shows being hand-edited directly):

```
byteIndex = (controller.start_channel - 1) + controller_offset   // both 1-based/0-based made explicit
controllerSpanEnd = max over active controllers of (start_channel - 1 + channel_count), or 0 if none
```
Unassigned models (no `controller_id`) keep writing sequentially starting at
`controllerSpanEnd`, exactly like today's layout-order concatenation — but shifted by however
much controller-routed space precedes them. **This is a real, stated behavior change, not the
"nothing regresses" claim the first draft made**: the moment any controller exists and has
models assigned, unassigned models' byte positions shift from today's offset-0 start. It's
opt-in (only happens once the user actually creates a controller and assigns models to it),
but any previously-exported `.fseq` or FPP channel mapping built against today's output will
differ after this ships. `channelCount = controllerSpanEnd + sum(unassigned models' bytes)`.
`writeFseqV2` already throws if `frame.length !== channelCount` (existing test coverage in
`packages/formats/test/fseq.test.ts`) — that's the safety net for getting the sizing formula
wrong; the export path additionally needs a try/catch around the `frame.set()` calls (currently
none exists — `SequencerPage.vue`'s Export button has no error handling at all) so an
oversized/overlapping assignment that slips past the save-time 422 check surfaces as a message,
not an uncaught exception in a click handler.

**Acceptance:** create a DDP controller, assign two models at different offsets, export
`.fseq`, confirm both models' bytes land at `controller.start_channel - 1 + controller_offset`
via the same round-trip parse pattern M5 already established for the writer; confirm an
over-length assignment is rejected at save time with a 422, not at export time with a crash;
confirm an unassigned model still exports (shifted, as stated above). PHPUnit feature tests for
CRUD + authorization, mirroring the actual existing pattern in
`apps/api/tests/Feature/LayoutModelsTest.php` (not `ModelEntityTest`, which doesn't exist).

---

## M12 — Layout editing: 2D first, then 3D

**Reframed from the first draft**, which jumped straight to 3D editing. `LayoutCanvas.vue` is
today a pure read-only `draw()` with zero pointer listeners — 2D drag-to-reposition has been a
documented ceiling since M1 and was never picked up through M9. Building a 3D gizmo before the
much cheaper 2D case exists inverts "smallest real slice," and `updateModel()` (the PATCH this
whole milestone depends on) currently has **zero callers anywhere in the app** — it's an
unused client method, not a proven persist path. Prove it once, cheaply, in 2D; reuse it in 3D.

### Step 1 — 2D drag-to-reposition (do this first)

`LayoutCanvas.vue` already computes a world-to-screen transform for drawing (`draw()` maps
`screen.x/y` to canvas coordinates) — inverting that for a drag is the cheap, no-new-dependency
version of this feature. Add pointer handlers: pointerdown hit-tests against each model's drawn
position (simple radius/bbox check, not raycasting — this is 2D canvas math, not Three.js),
pointermove updates a local drag position live, pointerup calls the *first real use* of
`api.updateModel(layoutId, modelId, { screen: {...} })`.

**Critical correctness note the first draft missed:** `ModelEntityController::update` replaces
the entire `screen` object — it does not deep-merge. A drag save must always send the full
`{x, y, z, scale, rotate}` (spread the existing values, override x/y), or it silently wipes
scale/rotate. This is the single most likely bug in this milestone and applies to both the 2D
and 3D save paths below.

### Step 2 — add `z`, then 3D editing

`screen` becomes `{x, y, z, scale, rotate}`. No migration (jsonb, no shape enforcement in
`ModelEntityController::update`/`bulkUpsert` today — confirmed, this part of the original claim
held). `extractScreenPosition()` in `import.ts` adds one line reading `attrs.WorldPosZ` the
same way it already reads `WorldPosX`/`Y` — the raw attribute already round-trips losslessly
into `raw_attrs` via the rgbeffects parser today, just never extracted. **Caveat:**
`bulkUpsert` is `updateOrCreate` keyed on name and overwrites `screen` wholesale on every
re-import — re-importing an `xlights_rgbeffects.xml` after a hand-edited 3D position will
clobber it back to the file's `WorldPos*` values. Worth knowing, not blocking.

`LayoutPage.vue` gets a "2D / 3D" toggle. The existing `.model-list` sidebar (already
click-selects models in 2D — this part of the app is more built than the first draft assumed)
**stays visible and functional in 3D mode**: list-click selects in the 3D canvas and vice
versa. This is the exact "list + detail panel" convention both the Controllers screenshot and
the Layout screenshot use as their *primary* selection method — clicking a specific item in a
rotated, zoomed 3D scene (especially near-identical, likely-overlapping models like the
reference's "RRBL" through "RRBL-8") is strictly worse than the list Logan already has, and M12
shouldn't be the milestone that makes selection harder.

New `LayoutCanvas3D.vue`, sharing scene/camera/renderer bootstrap with `HousePreview.vue` via
a small extracted `sceneSetup.ts` helper rather than duplicating it:

- **Per-model picking via invisible bounding-box meshes, not raycasting the Points cloud
  directly.** `HousePreview.vue` renders points with `sizeAttenuation: false` (constant 3px
  regardless of camera distance), so `Raycaster`'s Points-picking threshold (a world-space
  radius) becomes camera-distance-dependent — reliably wrong when zoomed in or out, and wrong
  in a way that depends on zoom, not model size. Build one `Box3`-derived invisible `Mesh` per
  model (`MeshBasicMaterial({ visible: false })`), raycast only against that array, keep the
  `Points` for display only (`points.raycast = () => {}`). The box doubles as the selection
  highlight and the drag-target.
- **Camera: `OrbitControls`** (`three/examples/jsm/controls/OrbitControls.js` — confirmed
  resolvable under this repo's exact `three`/Vite setup, real zero-new-dependency, typechecks
  clean against the installed `@types/three`).
- **Move: ground-plane drag or `DragControls`** (same `three/examples/jsm/controls` directory,
  zero new dependency), **not `TransformControls`** for the MVP — `TransformControls` brings a
  full per-axis gizmo, a mode state machine, and a real interaction footgun (it fights
  `OrbitControls` unless you toggle `orbit.enabled = false` on its `dragging-changed` event)
  for a milestone that already ships a numeric X/Y/Z panel for precision placement. Ship
  plane-drag first; a 3-axis gizmo is a legitimate, separable fast-follow once translate is
  proven out. *(If the gizmo is picked up later: `TransformControls` no longer extends
  `Object3D` in the installed r185 — attach via `scene.add(transformControls.getHelper())`,
  not `scene.add(transformControls)`, and dispose both controls' listeners on unmount or they
  leak across route changes — `HousePreview.vue`'s current teardown only disposes the
  renderer.)*
- A position panel (X/Y/Z number inputs) next to the selection, same pattern
  `EffectPropsPanel.vue` establishes.
- Persists via the now-proven `updateModel()` path from Step 1, same full-object-replace
  discipline.

**Known, pre-existing, not this milestone's job — but worth stating so nobody's surprised:**
`screen.rotate` (`RotateZ`) is captured on import and stored but rendered by *neither* the
existing 2D canvas nor `HousePreview.vue` today — a 3D editor built by reusing that code
inherits the same silent drop. Also, 2D's canvas flips Y for top-left screen origin while
Three.js is Y-up unflipped — the two views already disagree on vertical convention; the 3D
work should pick one canonical mapping (recommend: match the raw imported `WorldPosY`
convention, treat 2D's flip as display-only) and state it, rather than silently inheriting a
mismatch nobody chose on purpose.

**Explicitly not this milestone:** textured/image-mapped node rendering — the reference
screenshots' popped-out House Preview window shows real Santa/reindeer face textures wrapped
on cone geometry during playback (screenshots 5/6), which is a `HousePreview.vue`
rendering-fidelity gap (flat, untextured `THREE.Points`, confirmed), not a layout-*editing*
gap. This is the single most visually striking thing in the six reference screenshots and the
easiest thing to assume "3D" means once this ships — it's a separate, deferred item, unaffected
by M12's editing work either way. Also unchanged ROADMAP non-goals: mesh/GDTF 3D objects,
per-preview cameras, background/ground photo underlay in 3D. Rotate/shear via gizmo (translate
only, per the fast-follow note above).

**Acceptance, Step 1:** drag a model in 2D, confirm position persists across reload, confirm
scale/rotate survive the save (full-object-replace check). **Acceptance, Step 2:** toggle to
3D, orbit/pan/zoom, select a model via the list *or* a canvas click (both work, stay in sync),
drag it along the ground plane, confirm the X/Y/Z panel updates live and the position survives
reload. Verified live in-browser and screenshotted — this is inherently a visual/interaction
feature, matching how M4's original preview was verified.

---

## Corrections from review (what the first draft got wrong)

Kept here rather than silently fixed, matching this repo's own "document the cut, don't just
make it" discipline:

- First draft said webXLights has "17 effects" and "no `audio.ts`" and framed the M6-completion
  work described in an external handoff artifact as merged-but-abandoned on a branch. All
  three were wrong: **15** effects (`EFFECT_SCHEMAS` has 15 keys), `audio.ts` already exists
  and is used by `SequencerPage.vue`, and `git branch -a` shows only `main` — there is no
  abandoned branch. M6 shipped at its documented reduced scope (commit `1bc575d`) and stayed
  there; the artifact's claim of a further "M6 completion" pass merged as PR #1 doesn't match
  this repo's actual git history at all — treat that artifact as aspirational, not as
  describing real repo state.
- First draft claimed M11's export rewrite was "additive" with "nothing existing regresses" —
  false, corrected above (unassigned models' byte offsets shift once controllers exist).
- First draft claimed M10/M11/M12 (then "M10a/b/c") had "zero file overlap" — false, M11 and
  M12 both touch `LayoutPage.vue` (different regions, not a real conflict, but not zero-overlap
  either).
- First draft said the context menu's actions "map 1:1 to existing store methods" — true for
  four of five, but Cut isn't a store method (it's copy+delete) and the originally-specified
  emit payload (`{effect, x, y}`, no `row`) couldn't actually drive Paste/Duplicate.
- First draft said `ControllerController` would follow "the same shape as
  `ModelEntityController`" (`index/bulkUpsert/update`) — no controller in this codebase
  implements full CRUD; M11's is genuinely new shape, and needs the base-class name alias
  noted above.
- First draft proposed raycasting the shared `Points` buffer directly for 3D model picking —
  demonstrated unreliable given `sizeAttenuation: false`; replaced with per-model bounding-box
  meshes.
- First draft called `TransformControls` "the lazy choice over hand-rolling ground-plane
  raycasting" — `DragControls` ships in the same directory and is the actually-lazy MVP;
  `TransformControls` is real added interaction surface, moved to fast-follow.
- First draft invented a "+ Timing Track" add/delete-track UI beyond what M10's own problem
  statement needed (rendering the one existing track) — cut.
- First draft's M10 acceptance criteria cited Vitest coverage for `apps/web` — no test runner
  exists there today; standing one up is its own scope, not implied by this milestone.

This document supersedes the earlier draft entirely — no separate draft file is kept in the
repo.

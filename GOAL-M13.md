# webXLights goal prompt: M13 — Layout visual parity + model placement toolbar

Written 2026-08-12. Run as the goal for a session working in this repo, branch
`claude/xlights-visual-drag-drop-hild31`.

Unlike M10-M12 (`NEXT-MILESTONES.md`), this milestone was **not** written from Logan's own
reference screenshots — none were available in this session (no image attachments, nothing
under the repo or scratchpad). It is written from the official xLights manual
(`manual.xlights.org/xlights/chapters/chapter-four-tabs/layout` and `.../models`) and web
search results quoting it. Stated honestly, not silently: this is a lower-confidence source
than M10-M12's six screenshots, and anywhere this doc guesses at exact visuals (icon artwork,
pixel colors) it says so rather than presenting a guess as verified fact.

---

## Problem, precisely

`LayoutPage.vue`/`LayoutCanvas.vue` (M12) let you **select and reposition models that already
exist** — drag-to-move, numeric X/Y/Z/Scale/Rotate panel, 2D and 3D. There is still no way to
**create** a model at all. The only path to populate a layout is importing an
`xlights_rgbeffects.xml`. `NEXT-MILESTONES.md` line 109 already named the missing piece without
building it: *"placement already has its own gesture: armed palette + drag."*

The real xLights Layout tab (per the manual): a row of model-type icons sits at the top of the
canvas — Arch, Candy Cane, Circle, Custom, Icicles, Matrix, Single Line, Spinner, Star, Tree,
Window Frame, Wreath, Import Custom. Click an icon once to arm it (it gets a highlighted
outline); click-and-drag on the canvas to place a new instance, which renders in yellow while
being positioned/sized and appears in the model list on the left the moment it's placed. Model
configs persist into `xlights_rgbeffects.xml` for reuse.

## Scope

### 1. Model palette (`ModelPalette.vue`, new)

One button per DisplayAs type this engine already renders — the same 11 of PARITY.md's 12-type
list that have a real default geometry, **Custom excluded** (see cut #4 below): Matrix, Single
Line, Poly Line, Arches, Candy Canes, Circle, Star, Tree, Icicles, Window Frame, Wreath.

Rendered as a horizontal toolbar above `LayoutCanvas`, 2D mode only (see cut #2). Each button:
`draggable="true"`, `dragstart` sets `dataTransfer.setData("application/x-webxlights-model-type", type)`,
plus a plain-text label (no icon artwork — see cut #4). Hover/armed state reuses the
existing `.view-toggle button.active` gold-outline convention already in `LayoutPage.vue`
(`#e8c468` border) — no new color tokens.

### 2. Drop → create, inside `LayoutCanvas.vue`

The world/screen transform (`computeTransform`, `toWorldX/toWorldY`) is private to
`LayoutCanvas.vue` and already used for drag-to-move — reuse it, don't rebuild it in the parent.
`LayoutCanvas.vue`'s `<canvas>` gets `@dragover.prevent` (required for `drop` to fire at all) and
`@drop`, which reads the type off `dataTransfer`, inverts the drop point through the *current*
(pre-drop) transform the same way `onPointerMove` already does, and emits
`create: [type: string, x: number, y: number]`. `LayoutPage.vue` handles it:

- Generate a unique name: `${type}-${n}` where `n` is one past the highest existing suffix for
  that type among `models.value` (matches the xLights convention of auto-numbered names, e.g.
  "RRBL" through "RRBL-8" that `NEXT-MILESTONES.md` line 289 already references from the real
  screenshots).
- `api.bulkUpsertModels(layout.id, [{ name, type, supported: true, params: {}, raw_attrs: {},
  screen: { x, y, z: 0, scale: 1, rotate: 0 }, order: models.value.length }])` — reuses the
  existing upsert-by-name endpoint, no new backend route needed for create.
- `raw_attrs: {}` is deliberate: `computeGeometryFromAttrs` (packages/engine) already has a
  sensible fallback default for every one of these 11 types (e.g. Tree: 16 strings, 50
  nodes/string, Round, 360°) — the same defaults a real xLights "place with defaults, resize
  after" flow would give you.
- Refresh `models.value`, auto-select the new model (so the position panel is immediately
  useful).

### 3. Delete

Necessary complement to create — see review pass 3 below for why this isn't optional scope
creep. Backend: `ModelEntityController::destroy` (`DELETE /v1/layouts/{layout}/models/{model}`,
`editor`-authorized, `abort_unless($model->layout_id === $layout->id, 404)`, matching `update`'s
existing pattern). Client: `api.deleteModel(layoutId, modelId)`. UI: a Delete button in the
existing position panel, plus a `Delete`/`Backspace` keydown handler when a model is selected
and focus isn't in a text input — xLights' own shortcut. Confirm via a plain `window.confirm()`
(zero new dependency, matches this app's existing no-modal-library convention) since it's
unrecoverable through this UI.

### 4. Rename

Double-click a model-list `<li>`'s name → becomes a text `<input>`; Enter or blur commits via
`api.updateModel(layoutId, id, { name })` (the `update` endpoint already validates `name` as
`sometimes|string` — no backend change); Escape cancels. Small (~15 lines), and closes the real
gap Pass 3 below identifies: auto-generated names like "Tree-2" are meaningless without it.

### 5. Visual pass

Compare current `LayoutPage.vue` against the manual's description: dark canvas background
(already `#111116`, close to xLights' black-when-no-background-image default — not changed),
model list on the left (already present), model properties on selection (already present as
the position panel). The one structural gap is the missing toolbar (#1 above).

**Correction from live screenshotting (see review passes — this was wrong in the first draft):**
the canvas is dark but the surrounding chrome — header bar, model-list sidebar, position panel —
is plain white/light (`system-ui` default black-on-white), while every real xLights screenshot
referenced in `NEXT-MILESTONES.md` and the manual shows a dark UI *throughout the whole editor
window*, not just the preview canvas. That's a real, visible mismatch this milestone should fix
since it's the single biggest visual difference from xLights on the one page this milestone
already touches. Scoped narrowly: a dark theme (panel background ~`#1a1a20`, text `#ddd`,
borders `#333`, the existing `#e8c468` gold accent unchanged) for `LayoutPage.vue`'s own chrome
only — header, sidebar, position panel. **Not** a whole-app theme change (`AuthPage.vue`,
`ProjectsPage.vue`, other pages stay as they are — out of scope, no evidence gathered about them
either way, and changing them isn't needed to compare against xLights' *Layout* tab specifically).

### 6. Spacing/placement correctness (the trigger for this whole process)

- Confirm live (not just by reading code) that a drop lands under the cursor: drop-point
  inversion must use the transform computed from `props.models` **before** the new model is
  added (i.e., the transform the canvas is currently showing) — that's what reusing
  `onPointerMove`'s exact pattern guarantees, not a new calculation.
- Confirm a freshly created model (engine-default `raw_attrs`, scale 1) renders at a size
  visually consistent with imported neighbors — same `NODE_SPACING` constant drives both, so
  this should hold, but "should" isn't "verified"; check live against a real imported
  `xlights_rgbeffects.xml` fixture, not just an empty layout.
- `worldBounds()`/`fitScale` recompute on every model change (already true for drag-to-move
  today), so the view re-fits immediately after a drop — pre-existing behavior, not a new
  regression, not fixed here.

## Explicit cuts (stated, not silent)

1. **Custom excluded from the palette.** `parseCustomModelGrid` requires a real `CustomModel`
   attribute string (a compressed grid); `raw_attrs: {}` would make a dropped Custom model
   geometry-less forever — reads as a bug, not a placeholder. Real xLights uses a dedicated grid
   editor for Custom models, which is its own, much larger feature. Excluded here rather than
   faked with a degenerate default grid.
2. **Drag-to-place sets default geometry, not drag-to-size.** Real xLights lets the initial
   drag define a matrix's width/height, an arch's span, etc., live during placement. This
   milestone places at the engine's fallback defaults on drop; resizing is only what the
   existing numeric panel already exposes (X/Y/Z/Scale/Rotate) — not per-type structural params
   (string count, node count, degrees, ...). A real fidelity gap versus xLights, not a rounding
   error — recorded here and in `PARITY.md`, not glossed over.
3. **Palette is 2D-only.** Creating directly into the 3D view would need ground-plane
   raycasting from a native HTML5 drag event, a materially different mechanism from the 2D
   canvas-transform inversion this milestone reuses. Models created in 2D are immediately
   editable in 3D via the existing M12 path (list-click select, drag, numeric panel) — only
   *creation* is 2D-only.
4. **No icon artwork.** Palette buttons are text-labeled, not glyph icons — this repo has no
   icon asset pipeline and adding one (or hand-drawing 11 SVGs) is disproportionate to what was
   asked. The interaction (click/drag a labeled control to place a model) is what's being
   matched, not pixel-identical toolbar art — stated since no reference screenshot could verify
   the real icons anyway (see the top of this doc).
5. **No per-type structural param editor.** Follows from cut #2 — out of scope for this
   milestone, would be its own real feature (a form driven by each type's attribute schema,
   analogous to `EFFECT_SCHEMAS` for effects but for model geometry).

## Verification

**Environment note:** this session has no working Docker daemon (`/var/run/docker.sock` absent)
— the documented `docker compose up -d postgres` flow doesn't work here. Fallback for this
session's live verification only: point `apps/api/.env` at `sqlite` (gitignored, never
committed; Postgres stays the real/deployed database per `DECISIONS.md`'s locked stack),
`php artisan migrate`, `php artisan serve`, `npm run dev`, drive it with the pre-installed
Chromium.

No vitest exists in `apps/web` (confirmed, same as M10/M12) — verify live in-browser and
screenshot, matching this repo's established pattern for frontend work. Add PHPUnit feature
tests for the new `destroy` endpoint, mirroring `apps/api/tests/Feature/LayoutModelsTest.php`'s
existing pattern (M11's own precedent for backend-testable surface).

**Acceptance:** drag each of the 11 palette types onto the 2D canvas, each appears at the drop
point, in the model list, and survives a page reload; select a created model and confirm
Scale/Rotate/position edits persist (full-object-replace check, same as M12); delete a model via
button and via the Delete key, confirm it's gone after reload; double-click-rename a model,
confirm the new name persists; import a real `xlights_rgbeffects.xml` fixture and confirm
imported models and a freshly-dropped model render at visually consistent scale on the same
canvas. All verified live, screenshotted.

---

## Five adversarial review passes (self-run, no reference screenshots to check against — see
top of doc)

**Pass 1 — technical feasibility / where does the code actually have to live.** First draft said
"the canvas listens for dragover/drop" without saying *which* component. `computeTransform` is a
private closure inside `LayoutCanvas.vue`; the palette lives in the parent `LayoutPage.vue`. The
drop handler and coordinate inversion must be in `LayoutCanvas.vue` (it already owns the
transform and the pointer-drag precedent), emitting a `create` event upward — not computed in
the parent from scratch. Fixed in scope item #2 above.

**Pass 2 — xLights fidelity vs. what's being cut.** First draft implied the placement gesture
would be faithfully reproduced. It isn't, fully: real xLights' drag *sizes* the model as you
drag; this milestone drops at fixed engine defaults. That's a real, stated fidelity gap (cut
#2), not a detail. It also surfaces a knock-on gap: without a structural-param editor, a
misconfigured or wrong-type drop has no recovery path except delete-and-redo — which is *why*
delete (scope item #3) is required scope, not a nice-to-have.

**Pass 3 — scope discipline: is delete/rename actually justified, is Custom handled honestly.**
Confirmed via Pass 2 that delete is load-bearing, not creep. Checked what a `raw_attrs: {}`
Custom model actually does (`parseCustomModelGrid(undefined)` → null geometry → permanent
unsupported-looking placeholder) — that's a silent-looking bug if shipped, not a stated cut;
fixed by excluding Custom from the palette entirely (cut #1) instead of faking a grid. Rename
added because auto-generated names ("Tree-1", "Tree-2") are otherwise unlabeled and
indistinguishable in the model list — small, reuses the existing `update` endpoint verbatim.

**Pass 4 — spacing/placement correctness, the user's actual trigger condition for this process.**
Verified by code reading that drop-point inversion reusing `onPointerMove`'s exact transform
should land under the cursor correctly, and that `NODE_SPACING` being the one constant driving
both imported and freshly-created model rendering means scale *should* be consistent — but
flagged both as "verify live," not "assumed correct," since this is exactly the class of thing
that reads fine in code and looks wrong on screen. Added to the Verification section as
required, not optional, checks.

**Pass 5 — testability given this session's actual environment.** Docker isn't available here
(checked: no `/var/run/docker.sock`), which the documented dev-setup flow assumes. Original
draft didn't account for this. Added the sqlite fallback note so verification doesn't silently
get skipped or falsely claimed against a flow that can't run in this container. Also added
PHPUnit coverage for the one new backend endpoint (`destroy`), matching M11's own established
"mirror `LayoutModelsTest.php`" precedent — the frontend-only parts stay screenshot-verified per
this repo's standing practice (no vitest harness exists in `apps/web`, confirmed unchanged since
M10).

This document is the full spec — no separate execution doc. Execute it directly against this
branch.

## Correction found during execution (not a 6th pass — logged for the same reason M10-M12's
"Corrections from review" section exists: don't silently fix what the draft got wrong)

The draft's original visual-pass conclusion ("existing palette already close enough, no rework
justified") was written from reading CSS, not from looking at the page. A live screenshot of the
empty Layout page (`/projects/1/layout`, seeded via a throwaway sqlite-backed local run) showed
the canvas is dark but the header/sidebar/position-panel chrome around it is plain white —
starkly unlike every xLights screenshot this repo's own `NEXT-MILESTONES.md` describes. Scope
item #5 above was rewritten in place once this was found, rather than left wrong. This is
exactly the class of gap Pass 4/5 predicted ("reads fine in code, looks wrong on screen") —
recorded here as the concrete instance of it.

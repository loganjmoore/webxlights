# webXLights goal prompt: M10, M11, M12

Run this as the goal for a fresh session working in `/Users/loganmoore/code/webxlights`.
Supersedes the original `webxlights-goal-prompt.md` for everything after M9.

---

## Read first, in this order

1. **This file**, especially "Ground truth" below.
2. **`NEXT-MILESTONES.md`** in the repo root. That is the full, reviewed spec for M10/M11/M12,
   with file paths, data models, acceptance criteria, and every deliberate cut. This goal
   prompt is the wrapper; that file is the work.
3. **`DECISIONS.md`** for the house rule: every scope reduction gets written down with its
   reason. Silent gaps are the one unacceptable outcome.
4. `ROADMAP.md`, `PARITY.md`, `CHANGELOG.md` for context.

---

## Ground truth (verified against the code on 2026-08-10, trust this over any other doc)

**There is a handoff artifact in circulation that does not match this repo.** It describes an
"M6 completion" pass merged as PR #1: 25 effects, 16 value-curve types, 16 transitions, offline
FFT audio analysis, and an orbit/zoom 3D visualizer. **None of that is in `main`.** `git branch -a`
shows only `main`. If you are handed that document, or a summary derived from it, treat it as
aspirational and verify every claim against the code before building on it. This already caused
one wrong spec draft.

What is actually true:

| Claim | Reality |
|---|---|
| Effects | **15**, count the keys in `packages/engine/src/effects/schema.ts` |
| Value curves / transitions | One curve type (Ramp), Fade-only transitions, per M6's reduced scope |
| Audio | `apps/web/src/lib/audio.ts` exists and works. Server-side persistence now exists too (see below) |
| 3D preview | `HousePreview.vue` is one shared `THREE.Points`, z hardcoded to 0, `sizeAttenuation: false`, no camera controls |
| Layout editing | Does not exist. `LayoutCanvas.vue` is a read-only `draw()` with zero pointer listeners |
| `api.updateModel()` | Defined in `lib/api.ts`, **zero callers anywhere**. It is not a proven persist path |
| Controllers | No table, no model, no UI, no route. `models.start_channel` is a free-form string, never parsed |
| Timing marks | Stored and hotkeyed (`t`), **never drawn**. `SequencerGrid.vue` does not read `body.timingTracks` |
| Context menus | None anywhere in the app |
| App shell | `App.vue` is bare `<router-view />`. There is no tab bar. Nav is ad-hoc `<router-link>`s in page headers |
| Frontend tests | **No vitest in `apps/web`**, zero test files there. Root `npm test` runs `packages/engine` and `packages/formats` only |
| Backend tests | 21 PHPUnit tests, green |

**Audio persistence shipped since the last handoff and may be uncommitted.** A Render persistent
disk (`webxlights-audio`, 5GB, mounted at `/var/data` on `webxlights-web`) is provisioned and
`AUDIO_STORAGE_PATH=/var/data/audio` is set on the live service. The code adds a Laravel `audio`
disk, a `sequences.audio_path` column, upload/serve endpoints, and frontend auto-upload plus
auto-restore. **Step 0: if `git status` shows this work uncommitted, commit it on its own branch
and get it merged before starting M10.** M10 rewrites `SequencerPage.vue` and M11 adds routes to
`routes/api.php`, both of which that work already touches. Do not build on top of an uncommitted
tree.

---

## Working rules

- **One milestone at a time, in order: M10, then M11, then M12.** Do not start the next with the
  previous one's acceptance list unfinished. If a milestone turns out bigger than it looked, cut
  scope explicitly and write the cut into `DECISIONS.md` with its reason, the way M6 and M7 did.
  Shipping a documented slice beats shipping a half-built whole.
- **Verify live, do not assert.** Every prior milestone in `CHANGELOG.md` carries real evidence:
  a flow actually driven in a browser, a byte layout actually parsed back, a test count. Match
  that bar. "Should work" is not a result. Screenshot the UI work.
- **Do not invent a test harness for `apps/web`.** There is none, and standing one up is its own
  scope. Verify UI work in the browser like M2/M3/M4 did. If a genuinely pure function falls out
  of the math (hit-testing, snapping, channel offsets), export it so a later pass can test it for
  free, but do not build scaffolding around it now.
- **Reuse what is here.** Props and emits, not new store coupling, in `SequencerGrid.vue`. The
  existing `Project::authorize()` gate for new resources. The `EffectPropsPanel.vue` "select on
  the left, edit on the right" pattern for new detail panels. No new dependencies: everything
  M12 needs already ships inside the installed `three@0.185.1`.
- **No em dashes in any prose you write**, including docs and commit messages. Use periods,
  commas, or colons.
- Per milestone, before moving on: `CHANGELOG.md` entry with real evidence, `DECISIONS.md` entry
  for every ceiling, `PARITY.md` updated, `npm test` and `npm run typecheck` and
  `php -d memory_limit=1G vendor/bin/phpunit` all green, deployed to Render, verified live on
  the deployed URL.

---

## The three milestones

Full detail is in `NEXT-MILESTONES.md`. Summary of what each must deliver:

**M10, sequencer interaction parity.** Render the timing marks that are already stored but never
drawn (this is a coordinate-system change, not one draw call: the ruler row is pinned, so
`headerHeight` has to be threaded through both places that compute a row index). Left-edge resize
handle. Snap to timing marks. Right-click context menu with cut, copy, paste, duplicate, delete.
Plus two real bugs sitting in the same code: horizontal zoom and scroll is broken (the canvas is
container-width, not `duration * pxPerMs`, so effects past the right edge are unreachable), and
undo snapshots on every pointermove during a drag, so one drag fills the 100-entry stack and
Ctrl+Z nudges by a pixel instead of undoing the drag.

**M11, controllers.** A real `controllers` table and CRUD, a Controllers page matching the
reference screenshot, per-model controller assignment, and an `.fseq` export that routes through
actual channel allocation instead of import-order concatenation. DDP first, E1.31 universe math
deferred with the reason written down. `start_channel` is user-authoritative, not auto-allocated.
Be explicit in the changelog that unassigned models' byte positions shift once a controller
exists: that is a real behavior change, not a no-op.

**M12, layout editing, 2D before 3D.** Build 2D drag-to-reposition first. It is cheap, it has been
a documented ceiling since M1, and it proves the `updateModel()` persist path that currently has
zero callers and that 3D also depends on. Then add `screen.z` and a 3D mode with OrbitControls,
per-model picking, and drag-to-move. The existing model-list sidebar stays the primary selection
mechanism in 3D, since clicking a specific model in a rotated scene full of near-identical models
is worse than clicking its name.

---

## Traps that already cost time, do not rediscover them

- **`ModelEntityController::update` replaces the whole `screen` object, it does not deep-merge.**
  A position save must send the full `{x, y, z, scale, rotate}` or it silently wipes scale and
  rotate. This is the most likely bug in M12.
- **Do not raycast the `Points` cloud to pick models in 3D.** `sizeAttenuation: false` makes the
  pick radius camera-distance-dependent, so it misses when zoomed out and hits the wrong model
  when zoomed in. Use one invisible `Box3`-derived mesh per model as the pick and drag target,
  and keep the points for display only.
- **`App\Http\Controllers\Controller` is the base class every HTTP controller extends.** A
  `ControllerController` that references `App\Models\Controller` in the same file collides with
  its own parent. Alias it.
- **`writeFseqV2` throws if `frame.length !== channelCount`.** That is the safety net for getting
  M11's sizing formula wrong. Separately, `Uint8Array.set` throws `RangeError` on overflow and
  the Export button has no try/catch at all today, so validate assignments server-side at save
  time and wrap the export path.
- **`TransformControls` in r185 no longer extends `Object3D`.** If you reach for it later, add
  `transformControls.getHelper()` to the scene, not the controls object, and disable OrbitControls
  on its `dragging-changed` event or the gizmo drag also orbits the camera. `DragControls` is the
  smaller MVP.
- **`bulkUpsert` overwrites `screen` wholesale on every re-import.** Re-importing an
  `xlights_rgbeffects.xml` clobbers hand-edited positions back to the file's `WorldPos*` values.
- **`config/database.php` reads `DB_URL`, not `DATABASE_URL`.** Getting this wrong fails at
  migrate time with a misleading "connection refused" against localhost.
- **Local dev auth requires port 5173 exactly**, matching `SANCTUM_STATEFUL_DOMAINS`. Vite
  falling back to 5174 breaks session cookies with a confusing "Session store not set on request."
- **Render migrations run as a one-off job after deploy**, not `preDeployCommand` (the public API
  does not expose it for Docker services). Avoid nested quotes in `--start-command`, they fail
  silently.

## Local dev

Postgres runs via `docker compose up -d` on port 5433. API: `php artisan serve --port=8000` in
`apps/api`. Frontend: `npm run dev -w apps/web` on 5173, which proxies `/api` and `/sanctum` to
8000. Full checks from the repo root: `npm test`, `npm run typecheck`, `npm run lint`, and
`php -d memory_limit=1G vendor/bin/phpunit` inside `apps/api`.

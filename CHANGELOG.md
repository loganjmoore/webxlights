# Changelog

## Render styles: an effect can be laid out along the string, across the prop, or as one pixel

xLights' Render Style controls "how the buffer is laid out for a model when the effect is rendered". Six of them are now implemented — the ones that mean something for a single model:

- **Default** — the model's own buffer, unchanged.
- **Single Line** — every node end to end on one row, in wiring order. A chase runs along the physical string rather than across the model's grid.
- **As Pixel** — the whole prop behaves as one light.
- **Per Preview** — the buffer is laid out the way the model physically stands, so an effect sweeps across the prop rather than along the string. On a mega tree that's the difference between Bars chasing up the strands and Bars chasing up the tree.
- **Horizontal / Vertical Per Strand** — each strand becomes a row or a column.

The insight that made this cheap: a render style isn't a rendering mode, it's a **remap of which buffer cell each node reads from**. Effects already draw into a buffer and nodes already pull their colour out by `(bufX, bufY)`, so a style hands the effect a differently-shaped buffer and re-points the nodes at it. No effect needed changing. Screen coordinates are deliberately untouched — a style that shifted those would silently rearrange someone's yard.

One structural change came with it: **layers now composite in node space rather than buffer space**. Buffer-space compositing assumes every layer shares one buffer, which stops being true the moment styles exist — one layer may draw into a 16×50 grid while the layer under it draws into a single pixel. For layers that all use Default the result is identical, since blending is per-pixel and the mapping is per-node.

The remaining thirteen styles describe how several models in a *group* are arranged relative to each other, which needs group rendering this app doesn't have. Recorded in the coverage doc rather than faked.


## Three more effects: Life, Lightning and Candle

29 of 55 becomes 32.

- **Life** — Conway's Game of Life, whose four rules the manual quotes verbatim, plus three rule variants for its Type setting. The grid **wraps at the edges**: a model-sized buffer is nearly all edge — a 16×50 mega tree has more boundary cells than interior ones — so on a bounded grid every glider would die at a wall within a second and the effect would settle into nothing. Speed is generations per frame, so a slow setting holds a generation on screen rather than skipping the simulation forward.
- **Lightning** — a zigzag bolt with an optional fork. The palette colours the core and *white always edges it*, which the manual states as a fact about the effect rather than an option, and is what makes a bolt read as lightning instead of a coloured line. Width 1 gives a straight vertical line, as documented.
- **Candle** — a flickering flame. The palette is **opt-in** here, the opposite way round from every other effect: "by default the Color Palette is not used and the flame is always an orange to reddish color". Per Node gives every pixel its own flicker; without it the whole model flickers together, which is what you want when the model *is* one candle.

Tested against the canonical patterns rather than against our own output: a blinker oscillating with period two, a block staying still, and a blinker straddling the boundary surviving — which it only does if the grid wraps.


## Four more effects from the manual: Off, Shimmer, Fill and Snow Storm

Taking the coverage inventory in order, these four are the ones that need nothing the engine doesn't already have. 25 of 55 becomes 29.

- **Off** — every pixel off. The part that isn't a no-op is **Transparent**: an opaque Off hides the layers under it, which is the point when it's used to punch a gap in a sequence; a transparent one leaves them showing, which is the point when it gates another layer. Rendering nothing at all would only ever give the second.
- **Shimmer** — lights turning rapidly on and off, with Duty Factor as the share of each cycle they're on. **Use All Colors** changes what the effect *is* rather than just its colour: the manual calls it "a pulse rather than a shimmer with the selected colors pulsing off and on in sequence", so it steps one palette colour per cycle.
- **Fill** — fills from an edge to a position, cut into bands by Band Size and Skip Size. The direction names describe where the fill *starts*, and the manual is explicit that Left "starts at right and moves left" — the opposite of what the word suggests on its own.
- **Snow Storm** — particles blowing rather than falling (that's Snowflakes), each leaving a fading trail. Stateful, so it runs through both the scrub and sequential-export paths. Particles wrap at the edges rather than respawning, so the storm keeps its density instead of thinning out.

A pre-existing guard test — "every schema in the palette actually renders something through the pipeline" — caught Snow Storm rendering an empty frame, because it had been wired into the sequential-export path but not the scrubbing one. That test existed precisely for this and did its job.


## Read the xLights manual, and built the layer settings it documents

All 176 pages of the [xLights manual](https://manual.xlights.org/xlights) are now catalogued in `docs/MANUAL-COVERAGE.md` — every documented feature with a status against this app. It is deliberately separate from PARITY.md: that file records what was built and how faithfully, this one records what *exists in xLights*, so a gap can't hide by never being written down. It puts the count plainly: 55 effects to our 25, 21 model types to our 12, and a Layer Settings panel we had none of.

The first thing built from it is that panel, because it is the best value per line in the whole inventory — these apply *between* the effect and the model, so all 25 effects gain them at once:

- **Transformation** — rotate 90° either way, rotate 180°, flip horizontally or vertically. Rotation samples backwards from each destination pixel, so a non-square buffer turned a quarter turn stretches to fit rather than leaving holes or spilling out; a model's buffer can't change shape to suit the effect.
- **Blur** — a box blur weighted by alpha, so a lit pixel next to a transparent one spreads its colour instead of being dragged toward black. Averaging straight RGB is what makes naive blurs look muddy.
- **Sub-buffer** — confines an effect to part of a model. Implemented the way the manual defines it: *"the entire effect is rendered based on this new model size, whereas a mask covers up what you specify"*. The effect is handed a smaller buffer and composes itself into it, so Bars confined to the top half draws all its bars in that half rather than showing the top half of a full-size set.

Render Style (the 19 buffer layouts), Persistent and Roto-Zoom are not built; Persistent in particular needs the buffer to survive between frames, which this pipeline deliberately doesn't do. All three are recorded in the coverage doc.


## 3D layout: one axis at a time, a ground to stand on, and a way back

- **Dragging moves X and Y; hold Z for depth.** Free 3D dragging — what `DragControls` does, moving a model in whatever plane happens to face the camera — makes the other two axes drift every time you nudge one. A drag now moves a prop along the house and up the wall, and depth is an explicit modifier you hold. The hint in the corner says which mode the next drag will use.
- **Nothing sinks into the lawn.** A model's *lowest node* stops at the ground, so a prop rests on it rather than being buried to its middle. The floor is never above where a model already was, so a show that deliberately places something low doesn't get it yanked up the first time it's nudged sideways. The same rule applies to 2D drags, since that canvas is a front elevation on the same axis.
- **There's a ground to see.** A show carrying an xLights Gridlines object already drew one; everything else now gets a faint default grid at the same height. Without it, "nothing goes below the ground" is a rule that fires invisibly — a prop stops moving and it reads as a bug.
- **Reset view.** A button on the 3D canvas returns the camera to the default framing. That default now stands slightly *above* ground height rather than below it, which is a more sensible place to be returned to once there's a lawn in the scene.

The depth mapping is the interesting part. The obvious constructions — intersect a plane holding the axis, or take the closest point between the axis and the pointer ray — both collapse in exactly the view a depth drag is most wanted from: looking at the front of the house, where the depth axis points straight at the camera. One sends the intersection to infinity, the other divides by zero. Measuring the axis *on screen* degrades gracefully instead, and its sensitivity is capped to the view's own vertical scale — without that cap a 130px drag moved a prop eleven hundred units, most of a yard.


## The model list collapses to names, and the resize handles are visible

- **A row per model, not a panel per model.** Every row in the Layout sidebar carried a type, a channel and a controller dropdown, which on a hundred-model show made the list impossible to scan. Rows are now just names with a caret; clicking one expands that model's details in place — type, channel, controller assignment, position/scale/rotate, properties and delete. Only the sole selected model expands, since a marquee selection of thirty props opening thirty panels would be worse than the flat list it replaces.
- **The resize handles were there, and invisible.** They were drawn 8px across in the same gold as the lit nodes, so on a dense prop they read as three more lights rather than as controls. They're now larger, white-filled with a dark border, standing off the model's own bounds, on a dashed selection box drawn dark-then-light so it survives over a bright model. The grab maths subtracts the new standoff, so a model doesn't grow by it on every drag.
- **The property grid was showing schema defaults on legacy files.** It read only xLights' descriptive attribute names while the geometry reads those *and* the older `parm1`/`parm2`/`parm3` — so a matrix built from `parm1="32"` displayed "# Strings 16" next to a shape that was visibly 32 wide. Both spellings are read now, matching what the geometry actually used.


## The popped-out preview no longer takes the sequencer down with it

Opening the pop-out threw `Failed to execute 'postMessage' on 'BroadcastChannel': could not be cloned` and put the sequencer tab behind a "Something went wrong" overlay.

BroadcastChannel structured-clones its payload, and a Vue reactive object is a Proxy, which structured clone refuses. The snapshot sent when a preview window says hello carried `models` straight from a `ref`, so it was a proxy — and because the throw happened synchronously inside an event handler it reached the app's global error boundary and took down the tab that owns the audio.

Two changes, because either one alone leaves the failure mode:

- **The snapshot is unwrapped to plain data** before it goes on the channel, the same way `body` already was.
- **Every message now goes through one helper** that unwraps reactivity, falls back to a JSON round trip, and treats a send that still fails as a preview that missed an update rather than as a fatal error. A preview window asks for a fresh snapshot when it reloads; crashing the sequencer over it was never the right trade.

Verified by driving the real pop-out: the window opens, reports "Following sequencer", renders the house, and its Play button drives the sequencer tab's audio — with the fix reverted, the same script reproduces the overlay and the transport does nothing.


## Trees stood on their points, and models imported at default sizes

Both reported from a real show ("trees are upside down… the models are also not necessarily the correct scale"), and both reproduced by importing tree variants through the real app and looking at them.

- **A negative scale was being taken literally.** xLights stores a negative `ScaleY` for a model whose local Y runs opposite to ours — its render buffer's row 0 is the top, ours is the bottom. That sign is how such a model is drawn *upright*, not an instruction to mirror it, so applying it to geometry that was already the right way up flipped it: a mega tree stood on its point. Only the magnitude is used now. The cost is that a model somebody deliberately mirrored comes in unmirrored; the alternative was every tree in every show upside down, and the asymmetric props (trees, icicles, window frames) are exactly the ones it ruins. The import banner reports how many models this touched — so a file where it fires on nothing yet still imports upside down is telling you the cause is something else (`RotateZ`, most likely, which is left alone because a deliberate half turn is still a half turn).
- **xLights' `parm1`/`parm2`/`parm3` weren't read at all.** Those generic attribute names held every model's counts until the 2026.04 release renamed them to descriptive fields, keeping the old names readable — so every show saved before that release stores its counts under names the importer ignored, and silently imported at library defaults. A 32×100 matrix came in as 16×50, a 24-string tree as 16. No amount of placement work could have made those sizes right. Both spellings are now accepted, with the descriptive name winning when a file carries both.


## Imported layouts: right way up, right size

Two defects found by importing a full synthetic yard through the real app and looking at it, and by a report from a real show ("the trees look upside down, as well as the arches").

- **A run drawn right-to-left came out upside down.** A three-point model takes its angle from the vector between its endpoints, and for a right-to-left run that vector points backwards — so the model was turned through 180°, which also turns over the axis the arc rises on. An arch became a bowl and a candy cane hooked at the bottom. In xLights the third handle is what decides which side the arc rises to, and which end you anchored from doesn't change it. A backwards vector is now folded into a mirror along the model's own X axis: same line, same endpoints, same node order, but "up" stays up. A negative `Height` still flips the arc, because that sign is deliberate.
- **Boxed model sizes are no longer a guess.** `ScaleX` has two possible readings — a multiplier on a node-unit render size, or the world width outright — and they differ by a factor of the model's node count, so on a 32-wide matrix they differ by 32×. Get it wrong and one prop swallows the whole yard. xLights' documentation says only "ScaleXYZ determine the size of the model", so the importer now decides per file from evidence in the file: a prop cannot be wider than the spread of the models' own positions (decisive when it fires), and failing that, boxed props should be in the same size league as the models sized by their endpoints, which can be measured without knowing the reading. The import banner says which reading was used and what it was matched against, and the Layout page has a **Boxed sizes** toggle to flip it in one click if the call was wrong — nothing is lost either way, since `raw_attrs` is what gets re-read.


## Value curves, transitions and audio reactivity reach the UI

Three features that were fully implemented in the engine, tested, and documented on the Docs page — but that nothing in the app could actually reach.

- **Value curves.** `ValueCurveEditor.vue` existed and was imported by no one; the props panel showed a "VC" badge captioned *"stubbed until M6"*. The editor is now mounted on every VC-flagged numeric param of every effect: all 16 curve types, min/max, cycles and phase for the periodic ones, reverse, six presets, and a draggable point editor for Custom. Turning a curve on seeds it from the param's current value, so enabling one never jumps the effect to an unrelated range; turning it off collapses back to a single number. While a curve is on, the flat slider is hidden — leaving both would show a number that isn't what the effect is rendering.
- **Transitions.** The panel offered "Fade In (ms)" and "Fade Out (ms)" and nothing else, so 15 of the 16 implemented transition types were unreachable. There is now a Transitions section with an in and out type picker, duration, reverse, and a pattern-density knob that appears only for Blinds, Slide Bars and Checkerboard — the three types that read one.
- **Audio reactivity.** `analyzeAudioBuffer()` existed and was called from nowhere, so the VU Meter rendered against no audio in both previews and in the export. The sequencer now analyses a track once when it loads and hands the same series to the house preview, the popped-out preview window and the `.fseq` export, so the effect renders identically in all three (SPEC ch10/16 determinism). Analysis is deferred past a paint and reports "Analyzing audio…" rather than freezing the tab on load, and the series is broadcast to the preview window on its own message rather than inside the snapshot that goes out on every edit.


## "Copy placement report" on the Layout page

Placement can't be verified from inside the app. The maths is unit-tested and the placement systems are confirmed against the xLights manual, but whether a *real* show lands where it does in xLights can only be checked against that show — and the file that would settle it lives on the user's machine.

`raw_attrs` is lossless, so the imported models already carry everything needed. This button dumps, per model: what xLights wrote (`WorldPos*`, `Scale*`, `Rotate*`, `X2`/`Y2`/`Z2`, `Height`, `Shear`, `Angle`, `NumPoints`), which placement system was applied, what position/scale/rotation the importer derived, and the model's resulting on-canvas size — plus totals by placement system and by type. Clipboard first, file download as fallback.

Deliberately placement attributes only: channel assignments, controller names and start channels aren't needed to diagnose a layout and shouldn't end up pasted into a chat or an issue.

## Import reports which placement system it used

The one assumption in the placement work that couldn't be checked without a real xLights file is the *names* of the endpoint attributes (`X2`/`Y2`/`Z2`). If they're wrong for a given show, the two/three-point path silently falls back to the boxed reading — safe, but invisible.

- **Spelling variants accepted**: `X2`/`x2`, `Y2`/`y2`, `Z2`/`z2`, `Height`/`height`. xLights' XML isn't consistently capitalised, and losing the feature to a capital letter isn't a trade worth making.
- **The import banner now reports the breakdown** — "Imported 120 models, 11 groups — placement: 94 boxed, 18 two-point, 8 three-point". A show visibly full of arches and rooflines that reports 0 two-point and 0 three-point means the attribute names are wrong for that file, which is now one glance away instead of indistinguishable from "the fix didn't work".

## Placement corrected against the xLights manual

Checking the placement systems against the manual's own Layout documentation, rather than against inference from each prop's shape, found one wrong mapping and one bad default.

- **Icicles is three-point, not two-point** — the manual places it by dragging "the green or top blue pixel to hang the icicles at an angle and then ... the lower blue pixel to cause the drop to shear". Three handles.
- **A three-point model with no `Height` keeps its own proportions** instead of defaulting `Height` to 1 ("as tall as it is wide"). Roughly right for an arch; badly wrong for icicles, which would have hung most of the way down the yard.
- Confirmed rather than assumed from the same source: "XYZ are the center point of the model", "ScaleXYZ determine the size of the model", and that a Single Line runs between a green start handle and a blue end handle while Candy Canes add a third. Arches stay an inference — the manual documents their properties but not their handles.

## Restore the M6 work that PRs #2–#10 reverted

PR #1 (25 effects, the full value-curve and transition systems, audio reactivity) merged on 10 Aug. The parallel `claude/xlights-visual-drag-drop-hild31` branch behind PRs #2–#10 had been cut from main *before* that merge, so merging it reverted those files — `main` has been running 15 effects, one value-curve type and fade-only transitions ever since, with `packages/engine/src/effects/{garlands,curtain,plasma,galaxy,fan,marquee,circles,text,pictures,vuMeter}.ts` and `audio.ts` simply gone. Recovered by cherry-picking `refs/pull/1/head` onto current main.

**Restored in full:** the engine. 25 effects, all 16 value-curve types with the generic per-frame resolution pass, all 16 in/out transition types, and the offline FFT audio analysis the VU Meter family reads. Engine tests 151 → 275.

**Kept from main where the two diverged:** the per-effect Color palette (M15.3), the Layer Blending panel's blend mode and Mix (M15.4), the controller-routed `.fseq` addressing (M11) and the current `HousePreview`. `renderStateless`/`renderStateful` were re-patched so the per-effect palette still overrides the row palette on the paths M6 rewrote.

**Not re-integrated in this pass, and a real remaining gap:** M6's *UI* for the new capability. `EffectPropsPanel.vue` and `SequencerPage.vue` have both evolved substantially on main, so the value-curve editor (`ValueCurveEditor.vue` is restored but not yet mounted), the transition-type picker, and the audio-analysis wiring need re-integrating into the current panels rather than being pasted over them. Until then the new effects are placeable and render, but curves/transition types/audio are reachable only through the engine API.

## Models get a real Z axis — a 360° tree renders as a cone

The remaining structural difference against real xLights' 3D layout: a mega tree was a solid filled triangle instead of a cone.

- `computeTree` was already computing the cone, then discarding it — the Round style folded the wrap into `screenY` as a "depth cue" because `ModelNode` had nowhere to put depth. `ModelNode.screenZ` (optional; most props genuinely are flat) now carries it, and `screenY` is the strand height again.
- `nodeWorldOffset` returns `{x, y, z}` and `transformedHalfExtents` returns `halfD`, so depth flows through the one transform both canvases share. `scaleZ` scales it; `RotateZ` doesn't touch it, since that rotation spins the model in its own X/Y plane. This is also what finally makes the `scaleZ` field mean something.
- `HousePreview` now uses that shared transform as well — it had been placing nodes at `screenX * scale`, ignoring per-axis scale and rotation, so the sequencer's preview could show a show in a different shape from the layout it was built in.
- Verified top-down on a 24×30 360° tree: concentric rings, X span 12.0 = Z span 12.0, where every node used to sit at Z=0.

## Import scale — one unit convention across model types

Follow-up to the placement fix, from side-by-side screenshots of the same 120-model show in xLights and webXLights: positions were being read correctly but everything still came out at wildly different sizes, piled together.

- **`packages/engine/src/models/units.ts`** states the convention every model type now follows: *one local unit == the spacing between two adjacent nodes*. Circle, Star and Wreath were placing nodes on a normalized unit circle, so a 50-node ring and a 500-node ring were both 2 units across while a 50-node line was 49 — a 25× mismatch against every other type. Ring radii are now `n / 2π`. Effect rendering is untouched (effects address nodes via `bufX/bufY`).
- **Boxed scale** now divides through by the local-unit factor: xLights' `ScaleX` multiplies a node-unit render size, so importing it at face value inflated every boxed model 4× on top of the per-type inconsistency. `ScaleX`/`ScaleY` are applied independently, so a model that's wide and short in xLights stays wide and short here.
- Rendering the same synthetic yard before and after: world bounding box **699×1840 → 514×460**, from one model sprawling over everything to each prop distinguishable. `test/yard-layout.test.ts` locks in the structural properties (yard-shaped bounds, no model covering >60%, distinct centres, two-point models spanning their declared run) and `test/placement.test.ts` adds the cross-type invariant directly.

## Editors full width + popped-out house preview

- **The app shell no longer letterboxes the editors.** `#app` carried a fixed `width: 1126px; margin: 0 auto` from the Vite starter template, so the sequencer and the layout editor — full-screen tools — sat in a centred column with dead bands either side on any real monitor. Every page already sets its own inner max-width and padding, so the shell now just fills the viewport.
- **Pop out preview**: a new `/projects/:projectId/sequences/:sequenceId/preview` route puts the house preview in its own window (second monitor, the way real xLights does it), with its own Play/Stop/Stop-scrub transport. The sequencer stays the single source of truth — it owns the `<audio>` element and broadcasts the playhead over a `BroadcastChannel`; the preview mirrors it and sends transport *commands* back, so its buttons are a remote control rather than a second, competing transport. Two audio elements playing the same track would drift apart within seconds and you'd hear both.
- The preview also loads the sequence from the API itself, so it still shows the show when no sequencer tab is open — it just won't move until one is, and says so.

## Layout editor — multi-select, resize handles, in-app confirmations, import placement fix

- **Marquee multi-select** on the 2D layout canvas: drag on empty space to rubber-band a selection (by intersection, so a band clipping a big matrix still catches it), Shift/Cmd/Ctrl to add, Cmd/Ctrl-A for all, Escape to clear. Dragging any member moves the whole selection; Delete removes all of them behind a single confirmation.
- **Resize handles** on a single selected model — four corners (both axes) and four edges (one axis), computed in the model's own unrotated frame and drawn rotated with it so a handle means the same thing at any RotateZ. `scaleZ` is persisted alongside and the position panel gains a Scale Z field.
- **In-app confirmation dialogs** (`lib/confirm.ts` + `ConfirmDialog.vue`, mounted once in `App.vue`) replace every `window.confirm()`. Esc and backdrop cancel, Tab is trapped, focus returns where it was. Native dialogs are unstyleable, block a canvas mid-drag with the pointer captured, and get suppressed by Chrome after a few in a row — which would have silently turned "confirm before deleting" into "delete without asking".
- **Import placement systems** (`packages/engine/src/models/placement.ts`): xLights stores position differently per model class, and import read every model as "Boxed" (WorldPos = centre, ScaleX/RotateZ = size and angle). Two-point models (Single Line, Icicles) and three-point models (Arches, Candy Canes) store *one endpoint* plus an `X2/Y2/Z2` offset to the other, with size and angle coming from that vector — so every arch, candy cane, roofline and icicle run imported half its own length off-position, at default size, unrotated. Placement now derives the anchor, span and angle per system, with `Height` handled for three-point models. Poly Line's `PolyPointScreenLocation` and the three-point `Shear`/`Angle` attributes remain unimplemented and fall back rather than being mis-placed.
- `scaleZ` round-trips but has no visible effect yet: `ModelNode` carries only `screenX/screenY`, so every model is planar and there's no Z extent to scale. Documented rather than faked with a handle that moves a number and changes nothing.

## Fix — migrations run on deploy (production 500 on every Layout page)

- **The bug:** `GET /api/v1/layouts/{id}/view-objects` returned 500 in production for every layout after M15.7. That endpoint is part of the Layout page's own load, so the page came up behind a "Something went wrong" banner. M15.7's `create_view_objects_table` migration had never been applied — the code deployed, the table didn't.
- **Root cause, older than M15.7:** nothing ran migrations on deploy. `render.yaml` declares `preDeployCommand: php artisan migrate --force`, but Render doesn't honor it for a Docker service created via the public API (recorded in DECISIONS.md since M0), so migrations were manual one-off jobs someone had to remember. M15.7 was just the first time nobody did.
- `apps/api/docker/entrypoint.sh` (new, wired as the image `CMD`): prepares the persistent disk as before, runs `php artisan migrate --force` with retries for a cold database, then `exec`s supervisord. Only the web container runs it — the worker overrides `CMD` — so there's no concurrent-migration race. A migration that keeps failing fails the boot on purpose: Render then keeps the previous healthy deploy instead of serving a half-migrated app.
- `apps/web/src/pages/LayoutPage.vue`: view objects are a decorative helper layer, so a failure there now degrades to "no gridlines" plus a quiet inline notice instead of rejecting the `Promise.all` that also carries models and groups and blanking the page.
- `apps/api/tests/Feature/ViewObjectsTest.php` (new): index, bulk upsert, idempotency by name, authorization, validation — M15.7 shipped the controller with no coverage at all.

## M15.7 — view_objects import + Gridlines rendering

Revisits an M15.1 finding: `<view_object>` elements (Gridlines, Mesh, Terrain, ...) are a
separate xLights XML element from `<model>` - correctly *not* a model-import bug, but
`parseRgbEffectsXml` never parsed `<view_objects>` at all, so every real show's Gridlines/Mesh
helpers were silently dropped, not "correctly excluded." Real xLights' Layout tab "3D Objects"
sub-tab confirmed this is real, commonly-populated data.

- **New `view_objects` table/model/controller**, mirroring `models`' shape (`type`, `supported`,
  lossless `raw_attrs`). Import-only (bulk-upsert by name), no manual create/edit UI yet.
- **Only `Gridlines` renders** - the one type both commonly present and genuinely simple to
  render honestly; Mesh/Terrain need an OBJ-mesh loader or heightmap renderer this codebase
  doesn't have. Everything else still imports (kept, not silently lost) with `supported: false`.
- **2D renders Gridlines flat in the X/Y plane** (matching every other model on that canvas,
  which has no concept of 3D rotation at all); **3D applies the real WorldPos + RotateX/Y/Z**
  via a custom line-segment mesh (not `THREE.GridHelper`, which is square-only and would
  misrepresent xLights' independent Grid Width/Height - this real show's grid is 2500×2000).
  Respects the real "Active" checkbox in both.
- Verified live against the real 120-model show: re-imported, confirmed via DB query both real
  view objects landed correctly and the unsupported-types banner now lists "Mesh"; temporarily
  flipped `Active` to see the renderer actually work (real data had it off, matching real
  xLights) - both 2D and 3D grids rendered correctly at the real dimensions, then restored.
- New tests: `rgbeffects.test.ts` (view_objects parse separately from models, Gridlines
  supported/Mesh not) and a bulk-upsert/list round-trip in `LayoutModelsTest.php`. All existing
  tests still green: 130 engine + 21 formats (vitest), 30 PHPUnit, typecheck/lint clean.

## M15.6 — Timing track generators (fixed-interval, Metronome)

Closes the exact gap `PARITY.md` already flagged: "manual marks only, no fixed-interval/beat-bar
generators." Opened real xLights' Sequence Settings > Timings tab and its New Timing dialog for
reference (Empty, 25ms, 50ms, 100ms, Metronome, Metronome w/ Tags, FPP Commands, FPP Effects).

- **New "Timing" panel in the Sequencer**: Fixed interval (ms) or Metronome (BPM), Generate
  button. Ported the two options with no FPP/tag-data dependency; the other four need data this
  codebase doesn't have or add nothing over the existing "Empty" behavior.
- **A real bug found and fixed during live verification**: the first version overwrote
  `timingTracks[0]`'s marks. Testing against the real jinglebells sequence showed
  `timingTracks[0]` is "Beats" - a real imported track with 242 real marks, not a generic
  placeholder - so this would have silently destroyed real timing data. Fixed to always add a
  *new*, auto-named, de-duplicated track instead of overwriting one, matching what real xLights'
  own New Timing dialog does.
- Full multi-row timing tracks (separate rows per named track, like real xLights' Timings list)
  stayed out of scope - `SequencerGrid.vue` currently merges every track onto one pinned ruler
  and hardcodes `trackIndex: 0` in its click handling, a larger rendering change unrelated to
  the generator gap this pass closes.
- Verified live against the real 120707ms jinglebells sequence: generated a 50ms track (2415
  marks, matches duration/interval exactly) and a 120bpm Metronome track (500ms interval),
  confirmed via direct DB query that all 5 real imported tracks were untouched.
- All existing tests still green: 130 engine + 20 formats (vitest), 29 PHPUnit, typecheck/lint
  clean (this pass's logic lives in `apps/web`, which has no test harness - see M15.1's note on
  why that gap wasn't closed either; verified live instead, twice, once to catch the bug).

## M15.5 — Model Groups editor (Layout page)

Continuing the standing ask, this pass compared the Controllers tab (found already
appropriately scoped - the missing fields all relate to live network output, a documented
non-goal, so leaving them out avoids offering controls with no real effect) and the Layout
tab's Groups list (a real, previously-mismarked gap: `PARITY.md` claimed Model Groups was `✅`,
but the entire feature was import-only, with zero create/rename/membership/delete path).

- **New "Groups" tab on the Layout page**, alongside the existing "Models" tab: lists every
  group with its member count, a "+ New group" button, and an editor (name, buffer style,
  member checklist, Save, Delete) reusing the same visual language as the Position/Properties
  panels from M15.2.
- **Reuses the existing `bulkUpsertModelGroups` endpoint** (upsert-by-name, resolve members by
  name) as the save path for both create and edit, instead of a second mechanism - the import
  path and the new UI path now share one implementation.
- **Backend**: added the one missing endpoint, `DELETE /layouts/{layout}/model-groups/{group}`.
- Renaming a group correctly deletes the old row and recreates under the new name (required
  since the upsert endpoint matches by name) - verified this doesn't leave an orphaned duplicate.
- Verified live against the real 120-model/11-group show: all 11 real groups listed with real
  member counts; edited "House"'s membership (added a 3rd model, persisted); created and deleted
  a throwaway group; renamed "Spiral Trees" and confirmed via direct DB query the old row was
  gone, the new one had both original members, and no duplicate was left behind.
- New test: `test_deleting_a_model_group_removes_it` in `LayoutModelsTest.php`. All existing
  tests still green: 130 engine + 20 formats (vitest), 29 PHPUnit, typecheck/lint clean.

## M15.4 — Layer Blending panel (blend mode, Mix, Fade transitions)

Completes the three-panel effect-editing comparison M15.3 started (Effect Settings, Color, Layer
Blending). The surprise: the engine already fully implements all of this - 10 blend modes
(`blend.ts`), the "Mix" effect-mix-threshold slider (`layerStack.ts`), and Fade In/Out
transitions (`transition.ts`), all since M3 - but every layer was hardcoded to Normal/0, and
`RenderableEffect.transition` had no `SequenceEffect` field to populate it from. Zero references
anywhere in `apps/web` to any of these three engine capabilities before this pass.

- **New "Layer Blending" section in the Sequencer's effect panel**: Blend Mode dropdown (all 10
  implemented modes), Mix slider (0-100%), Fade In/Fade Out (ms) number inputs.
- **`packages/engine`**: `RenderableEffect.blendMode?`/`mix?` join the M15.3 `palette?` pattern,
  resolved at both `LayerSpec`-construction sites in `renderFrame.ts` instead of the previous
  hardcoded `"Normal"`/`0`.
- UI labels the slider "Mix" (the engine's own name for the field), not "Morph" - real xLights'
  panel has both, and they're different mechanics; borrowing the wrong label would imply Morph
  support that doesn't exist.
- Verified live against a real imported Pinwheel effect: set Blend Mode to Additive and Fade In
  to 500ms, confirmed both persisted through autosave to the database alongside the M15.3 color
  edit already on that effect.
- New regression test proving a per-effect `blendMode` override actually reaches
  `renderLayerStack` (not just that it round-trips through storage): two opaque layers under
  Normal blend show only the top layer's color; the same two layers with Additive blend on top
  produce the real additive-composited color. All existing tests still green: 130 engine + 20
  formats (vitest), 28 PHPUnit, typecheck/lint clean.

## M15.3 — Per-effect Color palette

Continuing the standing ask to close gaps between webXLights and the real desktop xLights app -
this pass compared the Sequencer's effect-editing surface. Real xLights builds this around three
panels: Effect Settings (already implemented), Color, and Layer Blending. Every webXLights effect
was locked to one fixed app-wide 2-color palette - both `HousePreview.vue` and `fseqExport.ts`
already carried a `ponytail:` comment flagging exactly this gap ("no palette editor yet").

- **Effects can now carry their own Color override** - a "Color" section in the Sequencer's
  effect panel with 1-6 swatches (matching real xLights), `+`/`×` to add/remove, falling back to
  the app-wide default when unset. Real, per-effect granularity - two effects on the same model
  can have different colors, matching how real xLights' Color tab works.
- **`packages/engine`**: `RenderableEffect.palette?: RGBA[]` resolved in `renderFrame.ts`
  (`effect.palette ?? rowPalette`); new `hexToRgba`/`rgbaToHex` in `color.ts`; `DEFAULT_PALETTE`/
  `DEFAULT_PALETTE_HEX` moved there too, replacing two copy-pasted RGBA literal arrays in
  `HousePreview.vue` and `fseqExport.ts` with one source of truth.
- **No backend changes** - `SequenceBody` is stored as an opaque JSON blob, so `palette` just
  flows through like any other effect field.
- Verified live against the real jinglebells sequence: selected a real imported Pinwheel effect,
  edited its first swatch to red, confirmed it persisted through autosave to the database and
  reactively round-tripped through the store.
- New tests: `color.test.ts` (hex round-trip, `DEFAULT_PALETTE` derives from the hex list, not an
  independent literal), a `render-frame.test.ts` case proving a per-effect palette wins over the
  row's default. All existing tests still green: 129 engine + 20 formats (vitest), 28 PHPUnit,
  typecheck/lint clean.

## M15.2 — Structural property editor (Layout page)

Prompted by comparing webXLights' Layout page against the real desktop xLights app side by side
on the same real show/models - the standing ask is to keep closing gaps between the two.

- **Added a "Properties" panel to the Layout page**, below the existing Position panel - the
  same real-xLights Layout tab pattern (Name/Type header + type-specific attribute grid) that
  was previously entirely missing. Real xLights lets you edit a Tree's Degrees/Type/# Strings,
  a Matrix's # Strings/Nodes-per-String, etc. directly in place; webXLights only exposed screen
  position/scale/rotate until now, confirmed by the codebase's own M13 comment flagging "no
  structural-param editor yet" as the reason a mis-imported model had no recovery path.
- **New `packages/engine/src/models/propertySchema.ts`** (`MODEL_PROPERTY_SCHEMAS`) declares the
  editable fields per model type, hand-matched to exactly the `raw_attrs` keys
  `computeGeometryFromAttrs` reads for that type - editing a field always has a real, visible
  effect, unlike real xLights' fuller grid (this engine doesn't render Tree's Rotation/Spiral
  Wraps/Perspective or Matrix's wiring direction yet, so those aren't offered).
- **Backend**: `ModelEntityController::update` now accepts `raw_attrs` (wholesale-replace, same
  convention as `screen`); a geometry-affecting edit re-sends `channel_count` when the model has
  a controller assigned, so a controller-routed model's channel span can't silently desync.
- Verified live against the real 120-model show: selected the real "MTL9" Tree, edited Degrees
  360 → 270, confirmed it persisted to the database and reactively round-tripped through the UI;
  switching to a real Matrix model ("Garage Matrix") correctly swapped to its own 2-field schema.
- New tests: `property-schema.test.ts` (every schema field's default reproduces
  `fromAttrs.ts`'s own fallback geometry - keeps the two hand-maintained lists in sync) and a
  `raw_attrs` PATCH round-trip in `LayoutModelsTest.php`. All existing tests still green:
  126 engine + 20 formats (vitest), 28 PHPUnit, typecheck/lint clean.

## M15.1 — Real-file follow-up (real xLights show, local session)

M15 (below) verified import/export against the repo's own fixtures because the session that did
it had no filesystem access to the user's actual xLights folder. This follow-up ran locally
against the user's real show (`~/Desktop/xlights`: `xlights_rgbeffects.xml`, 120 models/11
groups; `jinglebells.xsq`, 30 elements/804 effects) and the real desktop xLights app (installed
on the same Mac). Found and fixed four real bugs the fixtures never exercised:

- **Legacy `DisplayAs` strings weren't recognized as their canonical types.** xLights writes
  `"Tree 360"`/`"Tree Flat"`/`"Tree Ribbon"` for Tree style variants and `"Vert Matrix"`/
  `"Horiz Matrix"` for Matrix orientation, then normalizes them itself on load (confirmed against
  `DisplayAsType.h`'s legacy mapping in the reverse-engineered spec) - `SUPPORTED_DISPLAY_AS` only
  matched the bare `"Tree"`/`"Matrix"` strings, which real xLights almost never actually writes.
  In the real layout, 35 of 120 models (29%) - including "Tree 360", the single most common type
  in this show at 33 models - were silently downgraded to unsupported placeholders. Fixed with a
  `LEGACY_DISPLAY_AS` synonym map in `packages/formats/src/rgbeffects.ts`, applied before the
  supported-type check. Re-import after the fix: only `DmxServo`/`DmxGeneral`/`Cube` remain
  unsupported - all three genuinely out of the M1 12-type scope, not a naming miss.
- **`.xsq` import silently dropped every row targeting a Model Group.** A sequence Element
  targeting a group has no distinct type in the file (xLights writes `type="model"` for both) -
  the importer only checked model names, so a miss there was reported as "unmatched" and the row
  discarded, never falling back to a group-name lookup. Real-world impact: 11 of 30 (37%) of this
  file's model-type elements target a group (`Everything`, `HD`, `Matrixes`, `Pixel Trees`, etc.)
  - more than a third of a real sequence's targeted elements were lost on import. Fixed in
  `SequencesListPage.vue`'s `importXsq`: a model-name miss now falls back to the layout's group
  names before being reported unmatched, tagging the row `elementType: "group"` (already a
  first-class row type the Sequencer UI and store supported, just never populated by import).
- **The import diagnostic banner was computed, then thrown away.** `importXsq`'s own comment
  claimed "unmatched rows ... are reported, not silently dropped," but the message was set on a
  `ref` local to `SequencesListPage.vue` immediately before `router.push`-ing to the Sequencer
  page - the very next tick discarded it, so the user never saw which models/effects didn't fully
  import. Fixed by carrying the message through as a `?importMessage=` router query param,
  rendered as a dismissible banner on the Sequencer page and stripped from the URL on mount.
- **`.fseq` export crashed outright on any real-world sequence** with
  `Cannot read properties of undefined (reading 'r')` (`lerpColor` → `twoColorBlend` →
  `renderShockwave`). Root cause: `translateEffectParams` returns literally `{}` for any effect
  name without a `PARAM_MAPPER` entry (`translated: false`) instead of the engine's own schema
  defaults, and `renderShockwave`'s color-blend math has no guard against `undefined`/`NaN`
  params. Only 5 of the 15 render-implemented effects have a `PARAM_MAPPER` - the other 10
  (Shockwave, SingleStrand, Pinwheel, Wave, Butterfly, Fire, Meteors, Snowflakes, Strobe, Ripple)
  all hit this. In the real sequence, SingleStrand (267 uses) and Pinwheel (285) alone outnumber
  every fully-mapped effect combined - export was broken for essentially any real show, not an
  edge case. Fixed in `SequencesListPage.vue`: an untranslated effect's params now come from
  `defaultParamsFor(name)` (`@webxlights/engine` - the same schema defaults a manually-placed
  effect already gets) instead of an empty object.
- **Verified the one thing M15 flagged as never actually checked**: exported a real 4829-frame/
  588MB `.fseq` from the fixed sequence and opened it in the real desktop xLights app via
  File → Open Sequence. It opened cleanly with no error, correctly correlated channel ranges back
  to the real model/group names (Roof Line, Windows, Spiral Trees, House, Pixel Trees, Arches,
  mini trees, Big Bulbs, Everything, Matrixes, HD, DJ SIGN 1, Floss 1, Dabbing 1, pixsnowman), and
  showed an effect block at the same ~28-33s timestamp visible in webXLights' own Sequencer for
  DJ SIGN 1 - real, independent confirmation the byte layout is correct, not just spec-compliant
  in isolation.
- **Newly discovered, not fixed this pass**: Model Group rows now import and are editable in the
  Sequencer, but `fseqExport.ts` only reads `elementType === "model"` rows when building channel
  data - a group's effects never reach the actual `.fseq` output, silently. Real-world impact in
  this same file: 11 of 30 (37%) of targeted elements are groups. This is a real, previously
  undocumented gap (expanding a group effect across its member models' geometry at export time is
  real feature work, not a bug-sized fix) - not attempted here; see PARITY.md.
- All tests still green after the fixes: 124 engine + 19 formats (vitest) + 27 PHPUnit,
  `npm run typecheck`/`npm run lint` clean.

## M15 — Import/export verification, sequencer UX fixes, app-wide dark theme

Prompted by a request to verify import/export against real xLights files, check the Controllers
page's sizing/padding, polish the navbar/controls app-wide, confirm effect drag-and-drop works,
and add a way to manage which models show on the sequencer. No user-supplied xLights folder was
reachable in this remote session - checked `/mnt/attach` (empty) and the working tree; verified
against the repo's own real-format fixtures instead (`sample-rgbeffects.xml` + `sample.xsq`,
the latter a genuine EffectDB-ref-indexed file), stated plainly as the substitution it is. See
M15.1 above for the real-file follow-up this gap led to.

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
## M6 completion — the rest of effects wave 2, full value curves + transitions, audio reactivity, 3D visualizer

- `packages/engine`: **10 new effects, 25 total** — Garlands, Curtain, Plasma, Galaxy, Fan, Marquee, Circles, Text, Pictures and VU Meter, each faithful to its SPEC render path on the default/common options and each with its own test file. Circles is closed-form rather than state-carrying (its bounce is evaluated directly instead of integrated frame by frame), so scrubbing into the middle of one costs a single frame's work. Text rasterises through a new built-in 5×7 bitmap font (`effects/font5x7.ts`) because the engine is DOM-free and has no `fillText`; Pictures takes decoded RGBA rows so an image round-trips through the sequence JSON and renders identically in a Node test.
- `packages/engine`: **the full value-curve system** — all 16 xLights curve types (Flat, Ramp, Ramp Up/Down, Ramp Down/Up, Saw Tooth, Triangle, Sine, Abs Sine, Square, Parabolic Up/Down, Logarithmic Up/Down, Exponential Up/Down, Custom) with cycles, phase, reverse, and a Custom point list. `resolveParamsAtPosition()` collapses any curved param to a number once per effect per frame in `renderFrame.ts`, so every param already flagged `valueCurve: true` became curvable without touching a single effect file, and effects still only ever see plain numbers.
- `packages/engine`: **the full transition system** — 16 in/out types (Fade, Wipe, Wipe Vertical, From Middle, To Middle, Square Explode/Implode, Circle Explode/Implode, Clock, Blinds, Slide Bars, Bow Tie, Star, Checkerboard, Ripple) with pattern density and reverse. Each is an order field (`order(x,y) <= progress`), which makes "reveals nothing at 0, everything at 1, monotonically in between" true by construction for every type — and asserted for all 16.
- `packages/engine`: **audio analysis** (`audio.ts`) — a windowed radix-2 FFT producing a per-frame level and log-spaced spectrum for the whole track, computed once on load. Offline rather than a live `AnalyserNode` on purpose: rendering must be deterministic, and a full export runs faster than real time, so the preview and the `.fseq` export read the same numbers by construction.
- `apps/web`: **the 3D visualizer**, built out from the fixed-camera point cloud — orbit/zoom/pan, per-model depth from the layout's own `WorldPosZ`, round glow bulbs (generated sprite + an additive bloom pass, no post-processing chain), a ground grid sized to the show, front/left/right/top camera presets, live node-size/glow/grid controls, and an Expand mode. The playhead is now driven by `requestAnimationFrame` while playing instead of the `<audio>` element's ~4Hz `timeupdate`, so a sequence plays back smoothly rather than in visible steps; engine re-renders are still gated on the sequence's own frame rate.
- `apps/web`: `ValueCurveEditor.vue` (shape picker, range, cycles/phase, reverse, six presets, and a click/drag/shift-click point editor over a live plot), transition controls in the props panel, text and image inputs, and a warning when an audio-reactive effect is placed with no track loaded. `/docs` gains value-curve, transition and audio-reactive sections; the effect reference still generates itself from `EFFECT_SCHEMAS`.
- `apps/web`: the preview's palette and RNG seed moved into `lib/renderSettings.ts`, shared with the exporter — they were duplicated constants in two files, which is exactly how a preview quietly stops matching its export.
- Three bugs the new tests caught in the new code: Plasma's phase advanced in multiples of 2π, so at whole-number Speeds it rendered an identical "animated" frame at positions 0.5 and 1.0; Pictures sheared by one source row because the vertical flip was applied to the coordinate rather than the row index; and Curtain slammed shut on its own final frame because the sawtooth position wraps to 0 at 1.0.

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

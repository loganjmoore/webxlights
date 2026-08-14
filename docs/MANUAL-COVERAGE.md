# xLights manual coverage

A page-by-page inventory of what the [xLights manual](https://manual.xlights.org/xlights) documents,
and where webXLights stands against it. Built by reading all 176 pages of the manual (the site
publishes a markdown version of every page, indexed at `llms.txt`).

This is deliberately separate from `PARITY.md`. That file records what has been *built* and how
faithful it is; this one records what *exists in xLights*, so a gap can't hide by never being
written down. Status here means:

- ✅ implemented
- ⚠️ partial — the feature exists but not all of it
- ❌ absent
- 🚫 deliberate non-goal for v1 (recorded in DECISIONS.md)

---

## Chapter 4 — Layout tab

| Feature | Status | Notes |
|---|---|---|
| Model list, rename, delete, undo | ⚠️ | Rename and delete yes; no undo stack on the Layout tab |
| Filter the model list | ✅ | By name, type or controller name — the three xLights offers |
| Add models by drag-create | ✅ | 11-type palette |
| Multiple model instances at once | ✅ | Clone the selected model N times in one action, each copy offset from the last so the run isn't one indistinguishable pile |
| Copy / clone a model | ✅ | Copies geometry, sub-models and string type; deliberately **not** the controller assignment, since two models on the same channels is a show-day bug nothing errors on and a clone is exactly how you'd make one by accident |
| Replace model | ❌ | |
| Model settings (per-type geometry) | ⚠️ | Only the attributes our geometry reads — see PARITY |
| Setting start channels (auto + manual) | ⚠️ | Manual per-model start channel; no auto-allocation pass |
| **Model types** | | xLights ships 21; we render 17 |
| Arches, Candy Cane, Circle, Custom, Icicles, Matrix, PolyLine, Single Line, Star, Tree, Window Frame, Wreath | ✅ | |
| Spinner, Cube, Sphere, Channel Block, Image | ✅ | Spinner's arms, hollow centre, arc, start angle and zig-zag wiring; Cube as a box or a cylinder, with real depth and an unwrapped buffer (the manual: "while the model is 3D, xLights renders the effects in 2D"); Sphere with degrees and both latitudes; Channel Block as a row of independent cells, one per device. Image is a *single-channel prop* — "blow-molds, inflatables, incandescent cutouts" — so one node is its whole geometry; the picture itself is a layout-view concern this engine doesn't draw |
| Channel Block — per-channel "Channel Color" | ❌ | Which of the RGB values drives each output channel. Belongs to channel assignment on export rather than to geometry |
| Label | 🚫 | "A simple text model that displays a line of text directly in the layout and preview. It does not control any lights or channels" — an annotation, not a prop |
| DMX, DMX Moving Head Advance, Servo | 🚫 | Fixture control, not pixel rendering |
| Download / import models from the vendor library | ❌ | |
| Model groups (add, modify, delete, rename, clone, delete-empty) | ⚠️ | Add/modify/delete/rename; no clone, no delete-empty |
| SubModels (node range, sub-buffer) | ⚠️ | Imported, resolved to their own geometry, listed under their parent in the sequencer, rendered in both the preview and the `.fseq` export, and now **created and edited in-app** on the Layout page - with a live count of what each spec actually resolves to, since a range list is easy to get wrong by one and the symptom otherwise is a row that renders on nothing. Missing: xLights' Draw Model and Generate Slices tools |
| Objects — 2D background image | ✅ | A photo of the house behind the 2D layout, with an opacity slider. Downscaled on the client before it is stored, since a phone photo is several megabytes and this row is read on every page load. Composited as a sibling of the canvas rather than drawn into it, so it costs nothing per drag frame |
| Objects — Mesh (3D `.obj`) | 🚫 | No OBJ loader |
| Objects — Grid | ✅ | Gridlines view object |
| Objects — Pictures | ❌ | |
| Layout previews (multiple named previews) | ❌ | One preview |
| Moving models: drag, linked sets, bulk rotate, align | ⚠️ | Drag and multi-drag; no linked sets, bulk rotate or align |

## Chapter 4 — Sequencer tab

| Feature | Status | Notes |
|---|---|---|
| Timeline + waveform, zoom, scroll | ✅ | 3 zoom levels |
| Audio scrubbing | ❌ | Play-on-drag over the waveform |
| Time display format | ❌ | |
| Timeline tags | ❌ | |
| Timing tracks | ✅ | Fixed interval + metronome generation |
| Audio-generated timing tracks (beats/bars/lyrics) | ⚠️ | Interval/BPM only; no onset detection |
| Adding effects (drag, double-click, drop) | ✅ | |
| Radial effect wheel | ❌ | |
| Changing effects, moving/stretching, aligning | ⚠️ | Move and resize; no align commands |
| Copy / paste / delete effects | ✅ | Including one row and across rows |
| Colour settings — palette | ✅ | Up to 6 swatches |
| Colour settings — colour curves | ✅ | Both kinds. **Time**-based curves resolve once a frame, so all 43 effects gain them for free. **Spatial** ones can't be — within one frame the swatch is a different colour in different places — so the layer is rendered at a few points along the curve's axis and each pixel taken from, or blended between, the renders nearest its own position; exact for any effect whose output is linear in its palette, which is nearly all of them. Gradient and None blending, all four directions, up to the manual's 40 markers |
| Layers | ⚠️ | Up to 5, bottom-to-top |
| Layer blending — 24 modes | ✅ | All of them, including Canvas, Bottom-Top, Left-Right and Morph. The manual documents these with screenshots and the advice "experience is much better than reading about it" rather than defining them in words, so the eight added beyond the original ten follow what their names unambiguously mean (a mask hides, an unmask reveals, a shadow darkens); whether each matches xLights pixel for pixel is unverified. Bottom-Top and Left-Right are given the pixel's position along the axis, measured in buffer space where the geometry is known; Morph's cross-fade is driven by the position in the effect rather than by the Mix slider, per the manual's "during the length of the timing cell that the effects are in" |
| Layer blending — Canvas | ✅ | The layer is handed what the layers underneath it drew instead of a blank buffer, and its output replaces theirs — including where it cleared a pixel, which a Normal blend would have quietly kept |
| Layer blending — Suppress Until Frame, Freeze At Frame | ✅ | Both move or withhold the moment the effect renders at, rather than changing how it combines. Suppress keeps the effect running underneath while hiding it, which is what "warms up" an effect with unwanted opening frames |
| Transitions | ✅ | All 16 types, in and out |
| Mix slider | ✅ | |
| Layer settings — Render Style (buffer styles) | ✅ | All of them. Six for a single model (Default, Per Preview, Single Line, As Pixel, Horizontal/Vertical Per Strand) and the fourteen that arrange a *group's* members into one shared buffer (the four Stacked variants, Horizontal/Vertical Per Model, the two Per Model/Strand, both Overlays, Single Line as a Pixel, and the three Per Model ones that render on each prop separately). A group's Default is Per Preview, per the manual |
| Layer settings — Transformation (rotate/flip) | ✅ | Rotate 90 either way, rotate 180, flip H/V |
| Layer settings — Blur | ✅ | Alpha-weighted, so a blur softens coverage rather than dragging colour towards black |
| Layer settings — Sub-buffer | ✅ | The effect is handed a smaller buffer, per the manual's own distinction from a mask |
| Layer settings — Persistent | ✅ | The scrub path replays the effect's frames into one buffer (capped at 600); the sequential export path keeps the buffer between frames it is already walking |
| Roto-Zoom | ✅ | Rotation, zoom and pivot. xLights' preset rotation *sequences* over the effect's life are not separated out — this is the single turn the panel's own sliders describe |
| Value curves | ✅ | All 16 types + custom point editor |
| Effect presets | ✅ | Save an effect's whole configuration under a named group, apply it at the playhead, import and export `.xpreset` files. Saved on the layout, since presets are global in xLights rather than belonging to one sequence. Missing: presets spanning several layers or models at once, and Smart Presets |
| Views | ✅ | Named, *ordered* subsets of the sequencer's rows, with a picker in the toolbar. Saved on the layout, because the manual is explicit that "views work across sequences" — a per-sequence copy would have to be duplicated into every new sequence and would drift. The Master View isn't stored: it is "a special (system created) view" containing every row, so it is simply the absence of a selection. Missing: the eye icon that hides a model across all sequences (this app's Models panel is the per-sequence equivalent) |
| Song structure regions | ❌ | |
| Singing faces / phoneme breakdown | 🚫 | Needs face definitions |
| Pixel editor (matrix drawing tool) | ❌ | |
| Command palette | ❌ | |
| Keyboard shortcuts | ⚠️ | A handful; xLights documents ~60 |
| Render all / render on save | ⚠️ | We render on demand and on export |
| Export model as video / render-and-export | ❌ | |

## Chapter 4 — Built-in effects

xLights ships 55 effects. We render 44.

**Implemented (44):** Adjust, Bars, Butterfly, Candle, Circles, Color Wash, Curtain, Fan, Fill,
Fire, Galaxy, Garlands, Kaleidoscope, Life, Lightning, Lines, Marquee, Meteors, Morph, Off, On,
Pictures, Pinwheel, Fireworks, Music, Plasma, Ripple, Shape, Shimmer, Shockwave, Single Strand,
Sketch, Snow Storm, Snowflakes, Spirals, Spirograph, Strobe, Tendrils, Text, Tree, Twinkle,
VU Meter, Warp, Wave.

Kaleidoscope, Warp and Adjust are **canvas-mode** effects: they modify the layer below them
rather than drawing their own, and render nothing on any other blend mode — which is what the
manual means by Kaleidoscope "by itself it does nothing". The layer stack now seeds a Canvas
layer's buffer with what the layers underneath produced, which is what makes them possible; the
props panel says so when one is placed on a layer that isn't in Canvas mode.

**Every effect renderable with what the engine has is now implemented.** Sketch came with a
tracing canvas in the props panel, which is what xLights' Effect Assist panel is for. Its
background-image tracing aid is deliberately absent: the manual is explicit that "the image is not
rendered into the effect output — it is only there to help you trace", so its absence changes
nothing about what a sketch renders.

**Missing, needs a definition file (2):** Guitar (a tab/track) and State (state definitions).

(Shape's Emoji and system-font glyphs are not drawn - this engine has no font beyond its own
5x7 bitmap - so its Character setting is absent while the five geometric shapes are in.)

**Missing, needs infrastructure we don't have (5):**
Duplicate (renders another model's layer), Faces + Piano (face/state definitions),
Moving Head + Servo (DMX fixtures).

**Deliberate non-goals (4):** Shader (ISF), Liquid (physics), Glediator, Video.

## Chapter 5 — Menus

| Feature | Status | Notes |
|---|---|---|
| New sequence, sequence settings | ✅ | |
| Preferences (backup, view, effects grid, sequences, output, colours, other, services) | ❌ | No preferences at all |
| Backup and recovery | ⚠️ | Sequence version snapshots; no show-folder backup |
| Tools — Test | ❌ | Channel test patterns against live output |
| Tools — Convert | ❌ | Between sequence formats |
| Tools — Generate custom model | ❌ | From a photo of the prop |
| Tools — FPP Connect | ✅ | Upload + playlist sync |
| Tools — Lua scripting | 🚫 | |
| View — windows, perspectives | ❌ | |
| Import — sequence, effects from another sequence | ⚠️ | `.xsq` import; no per-effect import mapping |
| Audio menu | ❌ | |

## Chapter 4 — Controllers tab

| Feature | Status | Notes |
|---|---|---|
| Controller list, add, delete | ✅ | |
| USB / Ethernet / NULL controller types | ⚠️ | Generic controllers with a start channel and count |
| Controller visualiser | ⚠️ | A channel-by-channel view of what's assigned where, per controller, with free space, overruns and — the reason to have it — **channel collisions between models on the same controller**. Nothing else in the app surfaces those: each assignment is checked against the controller's span when it's made, never against the other models already on it. Missing: xLights' physical port/string breakdown, which needs per-port controller definitions this app doesn't model |
| Auto start-channel allocation | ✅ | First-fit packing of every unassigned model into the first active controller with room, starting after everything already there. Existing assignments are never moved — a hand-placed model is usually where it is because a physical port starts there. Reports what it couldn't place and why |

---

## What this says about priorities

Layer settings were the largest single lever, because they apply to every effect at once rather
than adding one more, and the panel is now complete: render style, transformation, blur,
sub-buffer, roto-zoom and persistent — including the group render styles, now that groups render
at all.

Sub-models now import and render, which was the piece real sequences leaned on hardest. What is
left of them is an in-app editor for creating one, which matters far less than not losing the
ones a show already has.

Group rows now render, which had been the quietest serious gap in the app: a group row could be
created and sequenced and would autosave, but both the preview and the `.fseq` export dropped it,
so effects placed on a group reached nothing at all. Real sequences target groups constantly —
37% of one real show's sequenced elements — so this was whole passages of a show going dark
without an error anywhere.

What is left is smaller and more scattered than it was: preferences, and a long tail of
Layout-tab conveniences (filter, clone, replace, align).
No single one of them is load-bearing the way group rendering was, and the eleven remaining
effects all need infrastructure that is a deliberate non-goal — face and state definitions, DMX
fixtures, shaders and video.

After that, the missing effects are worth taking in batches by how much machinery they share:
the simple per-pixel ones (Off, Shimmer, Fill, Snow Storm, Life, Lightning, Lines) before the
ones needing new primitives (Shape, Sketch, Warp, Morph).

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
| Filter the model list | ❌ | xLights filters by name/type/controller; ours is an unfiltered list |
| Add models by drag-create | ✅ | 11-type palette |
| Multiple model instances at once | ❌ | xLights can create N copies in one action |
| Copy / clone a model | ❌ | |
| Replace model | ❌ | |
| Model settings (per-type geometry) | ⚠️ | Only the attributes our geometry reads — see PARITY |
| Setting start channels (auto + manual) | ⚠️ | Manual per-model start channel; no auto-allocation pass |
| **Model types** | | xLights ships 21; we render 12 |
| Arches, Candy Cane, Circle, Custom, Icicles, Matrix, PolyLine, Single Line, Star, Tree, Window Frame, Wreath | ✅ | |
| Channel Block, Cube, Sphere, Spinner, Image, Label | ❌ | |
| DMX, DMX Moving Head Advance, Servo | 🚫 | Fixture control, not pixel rendering |
| Download / import models from the vendor library | ❌ | |
| Model groups (add, modify, delete, rename, clone, delete-empty) | ⚠️ | Add/modify/delete/rename; no clone, no delete-empty |
| **SubModels** (node range, draw model, sub-buffer, generate slices) | ❌ | Used heavily by real sequences |
| Objects — 2D background image | ❌ | The photo of the house behind the layout |
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
| Colour settings — **colour curves** | ❌ | A colour that varies across the effect, like a value curve |
| Layers | ⚠️ | Up to 5, bottom-to-top |
| Layer blending — 24 modes | ⚠️ | 10 implemented |
| Layer blending — Morph, Suppress Until Frame, Freeze At Frame, Canvas | ❌ | |
| Transitions | ✅ | All 16 types, in and out |
| Mix slider | ✅ | |
| **Layer settings — Render Style (buffer styles)** | ⚠️ | The six that mean something for a single model are implemented (Default, Per Preview, Single Line, As Pixel, Horizontal/Vertical Per Strand). The rest describe how several models in a *group* are arranged relative to each other, which needs group rendering this app doesn't have |
| **Layer settings — Transformation (rotate/flip)** | ❌ | |
| **Layer settings — Blur** | ❌ | |
| **Layer settings — Sub-buffer** | ❌ | Restricts an effect to part of the model |
| **Layer settings — Persistent** | ❌ | Don't clear the buffer between frames |
| **Roto-Zoom** | ❌ | Rotation presets, pivot, zoom |
| Value curves | ✅ | All 16 types + custom point editor |
| Effect presets | ❌ | Save/apply/import/export named effect settings |
| Views | ❌ | Named subsets of rows |
| Song structure regions | ❌ | |
| Singing faces / phoneme breakdown | 🚫 | Needs face definitions |
| Pixel editor (matrix drawing tool) | ❌ | |
| Command palette | ❌ | |
| Keyboard shortcuts | ⚠️ | A handful; xLights documents ~60 |
| Render all / render on save | ⚠️ | We render on demand and on export |
| Export model as video / render-and-export | ❌ | |

## Chapter 4 — Built-in effects

xLights ships 55 effects. We render 35.

**Implemented (35):** Bars, Butterfly, Candle, Circles, Color Wash, Curtain, Fan, Fill, Fire,
Galaxy, Garlands, Life, Lightning, Lines, Marquee, Meteors, Off, On, Pictures, Pinwheel,
Plasma, Ripple, Shape, Shimmer, Shockwave, Single Strand, Snow Storm, Snowflakes, Spirals,
Spirograph, Strobe, Text, Twinkle, VU Meter, Wave.

**Missing, and renderable with what the engine already has (11):**
Adjust, Fireworks, Guitar, Kaleidoscope, Morph, Music, Sketch, State, Tendrils, Tree, Warp.

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
| Controller visualiser | ❌ | Port-by-port layout of what's plugged in where |
| Auto start-channel allocation | ❌ | |

---

## What this says about priorities

Layer settings were the largest single lever, because they apply to every effect at once rather
than adding one more: render style, transformation, blur and sub-buffer are now in. What remains
of that panel is Persistent (needs the buffer to survive between frames) and Roto-Zoom.

Sub-models are now the biggest single gap, and what real sequences lean on hardest — an imported
`.xsq` that uses them renders wrong today, not merely plainly. Group render styles need group
rendering, which is its own piece of work.

After that, the missing effects are worth taking in batches by how much machinery they share:
the simple per-pixel ones (Off, Shimmer, Fill, Snow Storm, Life, Lightning, Lines) before the
ones needing new primitives (Shape, Sketch, Warp, Morph).

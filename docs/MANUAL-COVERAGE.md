# xLights manual coverage

A page-by-page inventory of what the [xLights manual](https://manual.xlights.org/xlights) documents,
and where webXLights stands against it. Built by reading all 176 pages of the manual (the site
publishes a markdown version of every page, indexed at `llms.txt`), and re-verified against a
fresh fetch of every one of those 176 pages — 88,710 words.

That re-read was worth doing twice over. It found a whole settings tab this inventory had never
named (Settings — Colors), and it found that the manual's own `llms-full.txt` bundle is *not*
complete: 25 of the 176 indexed pages are absent from it, including several effects. Anything
auditing this manual from that bundle alone would silently miss them.

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
| Replace model | ✅ | Change what a model *is* while keeping where it is and what it's wired to. Deleting and recreating loses its position, its controller assignment and its sub-models — which is most of the work that went into it |
| Model settings (per-type geometry) | ⚠️ | Only the attributes our geometry reads — see PARITY |
| Setting start channels (auto + manual) | ⚠️ | Manual per-model start channel; no auto-allocation pass |
| **Model types** | | xLights ships 21; we render 17 |
| Arches, Candy Cane, Circle, Custom, Icicles, Matrix, PolyLine, Single Line, Star, Tree, Window Frame, Wreath | ✅ | |
| Spinner, Cube, Sphere, Channel Block, Image | ✅ | Spinner's arms, hollow centre, arc, start angle and zig-zag wiring; Cube as a box or a cylinder, with real depth and an unwrapped buffer (the manual: "while the model is 3D, xLights renders the effects in 2D"); Sphere with degrees and both latitudes; Channel Block as a row of independent cells, one per device. Image is a *single-channel prop* — "blow-molds, inflatables, incandescent cutouts" — so one node is its whole geometry; the picture itself is a layout-view concern this engine doesn't draw |
| Channel Block — per-channel "Channel Color" | ✅ | Both the model-wide default and the per-channel list. And with it the thing that actually mattered: a Channel Block now emits **one byte per channel**, not three. It drives single devices — relays, AC lights, a smoke machine — so three-per-channel had a 24-channel relay board claim 72, shifting every model after it on the controller by 48 and lighting the wrong props, silently |
| Label | 🚫 | "A simple text model that displays a line of text directly in the layout and preview. It does not control any lights or channels" — an annotation, not a prop |
| DMX, DMX Moving Head Advance, Servo | 🚫 | Fixture control, not pixel rendering |
| Download / import models from the vendor library | ❌ | Needs xLights' vendor model web service. A third-party network dependency rather than a piece of app work |
| Model groups (add, modify, delete, rename, clone, delete-empty) | ⚠️ | Add/modify/delete/rename; no clone, no delete-empty |
| SubModels (node range, sub-buffer) | ⚠️ | Imported, resolved to their own geometry, listed under their parent in the sequencer, rendered in both the preview and the `.fseq` export, and now **created and edited in-app** on the Layout page - with a live count of what each spec actually resolves to, since a range list is easy to get wrong by one and the symptom otherwise is a row that renders on nothing. Missing: xLights' Draw Model and Generate Slices tools |
| Objects — 2D background image | ✅ | A photo of the house behind the 2D layout, with an opacity slider. Downscaled on the client before it is stored, since a phone photo is several megabytes and this row is read on every page load. Composited as a sibling of the canvas rather than drawn into it, so it costs nothing per drag frame |
| Objects — Mesh (3D `.obj`) | 🚫 | No OBJ loader |
| Objects — Grid | ✅ | Gridlines view object |
| Objects — Pictures | ⚠️ | The Pictures *effect* now has a file picker and the pixel editor — until this, `decodeImageForEffect` existed with no control anywhere, so a Pictures effect could only hold an image that arrived with an import. Layout-level picture *objects* (decorations in the layout view) are still absent |
| Layout previews (multiple named previews) | ✅ | All Models, Default and Unassigned, plus any preview the models name for themselves. A model's preview comes from its own attribute or from a group it's in, so a whole section moves in one edit. Named previews are computed from the models rather than stored — one that existed only in a list would linger after the last model left it |
| Moving models: drag, linked sets, bulk rotate, align | ⚠️ | Drag and multi-drag; no linked sets, bulk rotate or align |

## Chapter 4 — Sequencer tab

| Feature | Status | Notes |
|---|---|---|
| Timeline + waveform, zoom, scroll | ⚠️ | **A seven-step zoom ladder** (0.25x–16x), not the three levels this row was once marked ✅ on the strength of: 2x is nowhere near enough to place an effect against a 50ms frame in a four-minute song. All four of the manual's zoom and scroll gestures: **double-click the waveform** to zoom in, **shift+double-click** to zoom out, **ctrl+wheel** over the waveform or grid, **right-click the waveform** to reset, **shift+wheel** to move the waveform and grid sideways. Zooming holds the moment under the pointer still — without that, zooming in on the second chorus lands you in the first verse, which makes the gesture useless exactly where it matters. Right-click lands on the waveform rather than the grid's ruler because we have no separate timeline bar and the ruler's right-click is already the timing-mark menu. **Play range**: shift-drag the waveform to mark a section and it plays on its own, looping — "when it reaches the end of the area, will loop back to play from the beginning of that area". Its **edges are now draggable**, which is most of what you do with a range once it roughly covers the chorus; an edge takes precedence over the scrub, and is built through the same rule as a fresh mark so it can't collapse into a range that loops without advancing. Play jumps into the range rather than ignoring the highlight, and carries on from where it is if already inside. Marked with shift rather than a plain drag because a plain drag here already scrubs the audio, which xLights' waveform doesn't do. Missing: xLights' separate *timeline* selection — a second region, distinct from the waveform's, that plays **once** rather than looping ("you can then play that section once independent of the section highlighted to be played on the waveform"). Play-once versus loop is the whole point of having both, and it needs a timeline bar this app doesn't have yet |
| Audio scrubbing | ✅ | Drag the waveform and the track plays under the pointer, in short bursts. The burst is stopped on a timer rather than left running: a scrub that kept playing would drift away from the pointer within a second, and dragging back would then be seeking against audio that had moved on |
| Time display format | ✅ | Minutes:seconds, plain seconds, or frames — frames counted against the sequence's own frame rate, since a 20ms sequence and a 50ms one number the same second very differently |
| Timeline tags | ⚠️ | A region boundary is a named point on the timeline, which is what a tag is; xLights' separate tag list, with its own colours and independent of the section structure, isn't offered |
| Timing tracks | ✅ | Fixed interval + metronome generation, marks added and deleted on the ruler, split at the playhead, and divided by 2/3/4. A mark's label is editable from the grid (double-click, with Double Click Mode set to Edit Text). Labels are positional — `labels[i]` belongs to `marks[i]` — so every edit to the marks moves the labels with them; inserting one without doing so put every later word on the wrong phrase, silently, which is the bug subdividing a lyric track would have hit first |
| Audio-generated timing tracks (beats/bars/lyrics) | ⚠️ | Beat detection over the analysed audio: spectral flux against a *local* baseline, so one setting works across a quiet verse and a loud chorus. Sensitivity, a minimum gap (one drum hit is one mark, not a cluster), a spectrum range (low follows the kick, high the hats) and keep-every-Nth, which is roughly how bars come from beats. The estimated tempo is reported but never acted on — it answers "did this find the beat or find noise?", and using it to snap marks would move real ones to wrong places. Still missing: true downbeat/bar detection, and lyric tracks, which need the pronunciation dictionaries |
| Timing track from a Papagayo file | ✅ | See "Singing faces — Papagayo `.pgo` import" below |
| Timing track from a MIDI file | ✅ | A `.mid`'s notes become a timing track whose cells are labelled with the keys sounding in them — which is what the Piano effect reads, so this is how its "Midi file" notes source works here. Reads formats 0/1/2, running status, tempo changes (pooled across tracks, since format 1 keeps them in the first one) and SMPTE division. The Track picker and the manual's own Midi Start Time Adjust and Midi Speed Adjust are applied at import, because they describe the file rather than the rendering. Note ends are boundaries as well as note starts, so a held note stays pressed while the melody moves over it |
| Adding effects (drag, double-click, drop) | ✅ | A ✅ with an empty note, which is how this one hid. **A dropped effect now fills the interval it lands between** — "release it between two timing marks on the row of the model you wish the effect to play on". We had the rule backwards: the fixed length is the manual's *fallback* for having no marks to land between ("the effect defaults to 1 second long"), not the rule, so dropping an effect on a beat gave something that had to be dragged to fit the beat it was dropped on. Strictly between two marks — a drop past the last one gets the default rather than running to the end of the song. The radial wheel places the same way, since it is the manual's other way of doing the same act. Also here: **the selected timing track**, which the manual leans on ("if no timing track is selected...") and we had no notion of. It decides where a drop lands, what snapping snaps to, and which track a new mark or a division goes on; "All tracks" keeps the old merged behaviour. Every track's marks are still drawn, the ones in force at full strength — an effect snapping to a mark that looks like one it ignores reads as broken snapping. That selection also fixed a silent bug: right-clicking a mark on the second track reported it as track 0's, so Delete Mark filtered a track for a millisecond it didn't have and did nothing |
| Radial effect wheel | ✅ | Double-click empty grid, per the manual. Opens where the pointer already is, so the whole gesture is double-click, flick, release — which is what makes it worth having over a menu. Offers the same effects as the single-letter shortcuts, from the same list, so the wheel and the keyboard can't drift apart |
| Changing effects, moving/stretching, aligning | ⚠️ | Move and resize with the mouse, and — new — with the keyboard: "select the effect and use the Left or Right arrow keys to move it left or right", with Up and Down moving it between rows. The manual's jump rule is honoured, and it is the point of the feature: "when the effect encounters or is blocked by another effect, if you keep going, it will jump over the effect/effects and continue past", so a packed row stays navigable. A vertical move onto an occupied slot is refused instead, since there is nowhere for it to jump to. Arrows still nudge the playhead when no effect is selected. **Shift+drag an edge authors a fade** — "hold the Shift key and drag the left edge of an effect inwards to create a fade in, or drag the right edge inwards to create a fade out". The edge itself stays put, which is what tells the two gestures apart: one changes when the effect runs, the other how it arrives. It is unsnapped on purpose — a fade is a length by ear, not a boundary, and snapping it to the nearest mark would quantise the very thing you are dragging to taste. It adjusts whatever reveal type the effect already carries rather than forcing a Fade, and a transition the gesture created is cleared again when dragged back to nothing, while one that existed before keeps its type at zero length. The two fades can't cross. **Block selection** — the prerequisite the last audit named — is now in: drag a box over empty grid to select every effect it touches across rows, then "hold down shift and click the effect you want to be the reference". The reference carries a white outline and the rest of the block a dimmer one, because an alignment moves everything onto the reference and which one that is has to be visible *before* you pick the command. A drag draws a box and a click still seeks; which it was is decided on release, since seeking on the way into a box drag would drag the playhead along with it. A single selection is simply a block of one, so there is one notion of "selected" rather than two that can disagree. **The four Alignment commands** follow from it — start times, end times, both, and centrepoints — off the right-click menu, offered only when there is a block to align. Three of them keep each effect's own length; "both" is the one that changes durations, which is why it is a separate option rather than what align means. One undo entry covers the whole alignment. Delete now takes the block. **The ghost outline** is in: "while you drag, a 'ghost' outline follows the cursor to show where the effect (or effects) will land when you release the mouse button", and "only the ghost outlines that would collide with an existing effect turn red". Dragging carries the whole selected block, across rows as well as in time, and the block stays rigid — the delta is clamped for the block as a whole, so the effect that reaches the start of the sequence can't stop while the rest keep going and silently change the spacing. On release the free ones drop and the blocked ones stay, which is what "the rest are free to drop" means; refusing the whole drag because one of twelve overlapped would make block dragging useless on a busy row. Getting there meant the drag becoming a **proposal** rather than a live mutation: it used to commit on every pointermove, which is why it needed a snapshot taken at drag start and carefully not taken again, and why there was nothing to draw a ghost *of* — the effect was already there. One drag is now one undo entry, including a drag that changed both time and row. **Copy, cut, paste and duplicate now work on the block.** The clipboard holds relative positions — how far apart the effects are and which rows they sit on relative to the topmost — so a block copied from three props can be dropped anywhere and keeps its shape; absolute times would only ever paste back where they came from. It anchors on the earliest effect rather than the reference, or pasting would jump backwards whenever the reference wasn't the first one selected. A paste is one undo entry, and the pasted effects become the selection, so you can drag or align what you just pasted. A block pasted lower than it will fit piles onto the last row rather than half-vanishing. The **grid's gestures are now a closed set** in one function with a test that every one is reachable — the guard the shift-gesture regression needed, since a gesture nothing can produce is a feature that has silently stopped existing. Still missing: **Alt-drag stretching** ("effects can be stretched by using the Alt key and dragging one edge... to provide a Chase effect" — the manual never defines the stagger it produces, so it stays unbuilt rather than guessed at). Multi-effect **property editing**: the last audit recorded this as our own idea rather than a manual requirement, having found nothing about it on *this* page. That was half wrong, and the Colour settings page says so — "the 'Update' button will apply the current colors palettes to all the selected effects". So the **palette** across a selection is real parity and is now built; applying an effect's own *parameters* across a block is still our idea and still a bad one, since a Fire's settings mean nothing to a Bars, which is presumably why the manual offers this for colours and nothing else |
| Copy / paste / delete effects | ✅ | Including one row and across rows |
| Colour settings — palette, sparkles, brightness, contrast | ✅ | The row read "up to 6 swatches", and both halves of that were short. The manual: "some support just one, some support up to 8", so the cap is now **8** — six was low enough to have been hit by anyone building a rainbow. And the panel is not only swatches: "from the Color window, you can change the Colors that apply to the effect, as well as the **Sparkles, Brightness and Contrast** values", with the sparkle colour picked separately. All three are in, applied between the effect and the model like the layer settings, since they apply to every effect without any effect knowing. Sparkles are **deterministic in (x, y, frame)** rather than drawn from a random source — the rule the whole engine turns on, since an effect that twinkled differently in the exported file than on screen would not be found out until the show was running. They land only on lit pixels, or a chase becomes a field of static. The sliders run *before* the transition, so a fade in fades what they produced rather than brightening a partly-revealed frame back up. The **Update** button is in too: "will apply the current colors palettes to all the selected effects" |
| Colour settings — colour curves | ✅ | Both kinds. **Time**-based curves resolve once a frame, so all 43 effects gain them for free. **Spatial** ones can't be — within one frame the swatch is a different colour in different places — so the layer is rendered at a few points along the curve's axis and each pixel taken from, or blended between, the renders nearest its own position; exact for any effect whose output is linear in its palette, which is nearly all of them. Gradient and None blending, all four directions, up to the manual's 40 markers |
| Rendering (render buffer) | ✅ | "The Render Buffer is used to generated Effects data onto. For each Model/Group/Submodel, xLights creates a Rectangular Grid to render effects on to" — which is exactly this engine's model, including for sub-models and for a group's shared buffer |
| Render All | 🚫 | "Used to force a render of all effects — that have either been created within xLights, imported via the Import Effects function or has been imported as a Data layer." No analogue here, and not a gap: xLights keeps a rendered copy of the sequence that can fall out of date with the effects that produced it, where this renders on demand from the effects themselves. There is nothing to force, and a button that re-did what is already current would be a button that does nothing |
| Layers | ✅ | **Layers now have an interface**, which was the biggest single gap this audit found. The engine had blended simultaneous effects from the beginning — so Layer Blending and the Mix slider were implemented, correct and *unreachable*, because the grid refuses to place one effect on top of another. A layer is a number on the effect rather than a row of its own: layers are a property of the effects, not a container holding them, so an effect moved between layers is the same effect and an empty layer is a row to draw rather than a thing to store. Right-click a row label to show its layers, then **Add Layer Above / Add Layer Below / Delete Layer / Collapse Layers**, per "right click the model in the sequencer tab and choose Add Layer above or below (the current layer)". Layers draw highest-first, since the grid runs top-down while the stack composites bottom-up. Delete Layer names how many effects it will take with it. Collapse is a display change only — "collapses the expanded effect layers back down to a single row" — and the effects stay on the layers they were on. Effects placed, dropped or wheeled onto a layer row land on *that* layer, and dragging an effect between layer rows changes its layer. The composite order is the layer order in both render paths, not wherever the effects sit in the row's array. Cap 200, the manual's own. **Layers survive an import**: the `.xsq` parser walked `<EffectLayer>` elements to find effects and then discarded which layer each came from, flattening a real xLights sequence onto one layer — where every layer's effects stack at the same instant and still render, just not as anything the author wrote. Document order is read as bottom-to-top, which is the order this engine composites in. Effect **presets** deliberately don't carry a layer: a layer is a position, like the times, and a preset that carried one would move an effect to another layer on being applied. Package Show needs nothing — it stores each sequence body whole, so the field rides along. **Strands are derived, not stored**: a strand is one string of a multi-string prop — the physical run, not a user-defined sub-model — and every node already knows its `string` and `indexInString`, so a strand resolves through exactly the same path a sub-model does, parentIndices writeback included. Derived rather than stored deliberately: strands are a fact about the wiring, and a stored copy would go stale the moment the string count changed, with the symptom being effects rendering onto lights that had moved. A test asserts the strands cover every node exactly once, which is what makes strand rows safe to render — no light in two strands, none left out. **Strand rows are in**: expanding a model shows them ("click on the Model name in the sequencer to display the Strand names"), each takes effects of its own, and each takes the layer menu the row labels already have — so "then right click on the strand name and choose Add Layer above or below" works without any strand-specific code. Precedence follows the manual: "the strands blend onto the model level effects", so a strand sits on top of the model's own rows, and a sub-model on top of that, being the thing somebody drew rather than a fact about the wiring. Both render paths do it in that order — the preview and the `.fseq` export — because a show that looks right on screen and plays wrong in the yard is the failure this codebase guards hardest against. Offered only when a model has more than one strand: a single-run prop's strand row would be identical to its model row, so it would be a row that does nothing but take space. The four row kinds are one named type now rather than a union repeated in nine places |
| Layer blending — 24 modes | ✅ | All of them, including Canvas, Bottom-Top, Left-Right and Morph. The manual documents these with screenshots and the advice "experience is much better than reading about it" rather than defining them in words, so the eight added beyond the original ten follow what their names unambiguously mean (a mask hides, an unmask reveals, a shadow darkens); whether each matches xLights pixel for pixel is unverified. Bottom-Top and Left-Right are given the pixel's position along the axis, measured in buffer space where the geometry is known; Morph's cross-fade is driven by the position in the effect rather than by the Mix slider, per the manual's "during the length of the timing cell that the effects are in" |
| Layer blending — Canvas | ✅ | The layer is handed what the layers underneath it drew instead of a blank buffer, and its output replaces theirs — including where it cleared a pixel, which a Normal blend would have quietly kept |
| Layer blending — Suppress Until Frame, Freeze At Frame | ✅ | Both move or withhold the moment the effect renders at, rather than changing how it combines. Suppress keeps the effect running underneath while hiding it, which is what "warms up" an effect with unwanted opening frames |
| Transitions | ✅ | All 16 types, in and out |
| Mix slider | ✅ | "This slider adjusts the level of each effect in the combined output of the effects. You can use this to just put a hint (or more) of one effect on another." It was downgraded last pass for being correct but unreachable — nothing could author a second layer for it to act on. Now that layers can be created, it is reachable, so it goes back |
| Layer settings — Render Style (buffer styles) | ✅ | All of them. Six for a single model (Default, Per Preview, Single Line, As Pixel, Horizontal/Vertical Per Strand) and the fourteen that arrange a *group's* members into one shared buffer (the four Stacked variants, Horizontal/Vertical Per Model, the two Per Model/Strand, both Overlays, Single Line as a Pixel, and the three Per Model ones that render on each prop separately). A group's Default is Per Preview, per the manual |
| Layer settings — Transformation (rotate/flip) | ✅ | Rotate 90 either way, rotate 180, flip H/V |
| Layer settings — Blur | ✅ | Alpha-weighted, so a blur softens coverage rather than dragging colour towards black |
| Layer settings — Sub-buffer | ✅ | The effect is handed a smaller buffer, per the manual's own distinction from a mask |
| Layer settings — "Reset panel when changing effects" | 🚫 | A checkbox on xLights' Layer Settings panel, and not applicable here. It exists because that panel is *sticky* — it keeps the settings you last used and applies them to the next effect you select, so it needs a way to say "don't". Our panel reads the selected effect's own layer settings and shows those, so there is nothing to reset and a checkbox for it would control nothing |
| Layer settings — Roto-Zoom | ⚠️ | **This row was missing from the inventory entirely** — the third time that has happened, after the Settings > Colors tab and the Effects Grid tab, and found the same way: by reading the page rather than the list. Rotation in degrees, zoom, and a pivot point on both axes are implemented and have been for a while. What the *Layer Settings* page also names and we don't have: a **Rotation Preset** and a **Zoom Preset** dropdown, which are mutually exclusive with the manual attributes ("the Rotation attribute cannot be used if a Rotation Preset has been selected"), a **Zoom quality** control, and an **Application Order** setting. All three are named without being defined — the page gives no preset list, no quality scale and no explanation of what order is being applied to what — so they are recorded rather than guessed at, the same call as Alt-drag stretching. The page's **Camera dropdown** for the Per Preview render style is also absent, and that one is a real gap rather than an under-specified one: it picks which preview camera a Per Preview buffer is seen from |
| Layer settings — Persistent | ✅ | The scrub path replays the effect's frames into one buffer (capped at 600); the sequential export path keeps the buffer between frames it is already walking |
| Roto-Zoom | ✅ | Rotation, zoom and pivot. xLights' preset rotation *sequences* over the effect's life are not separated out — this is the single turn the panel's own sliders describe |
| Value curves | ✅ | All 16 types + custom point editor |
| Effect presets | ✅ | Save an effect's whole configuration under a named group, apply it at the playhead, import and export `.xpreset` files. Saved on the layout, since presets are global in xLights rather than belonging to one sequence. Missing: presets spanning several layers or models at once, and Smart Presets |
| Views | ✅ | Named, *ordered* subsets of the sequencer's rows, with a picker in the toolbar. Saved on the layout, because the manual is explicit that "views work across sequences" — a per-sequence copy would have to be duplicated into every new sequence and would drift. The Master View isn't stored: it is "a special (system created) view" containing every row, so it is simply the absence of a selection. Missing: the eye icon that hides a model across all sequences (this app's Models panel is the per-sequence equivalent) |
| Song structure regions | ⚠️ | Named, coloured sections of the timeline, created at the playhead or from a timing track's labels — "one region for each timing mark, using the timing mark's label as the region name". Plus the bulk action they exist for: copying one section's effects onto another, rebased on the target's start. Missing: per-region palette application, exporting a region as its own sequence, and Song Structure Views |
| Singing faces — face definitions and the Faces effect | ✅ | For coro faces (both node-range types). Defined per model on the Layout page, imported from `<faceInfo>`, and driven by a phoneme timing track |
| Singing faces — Matrix faces | ✅ | A picture per mouth position, with Centered/Scaled placement and an optional separate closed-eyes picture. Pictures are decoded down to the model's own resolution (capped at 64px, as the Pictures effect's are): a model row is fetched with every layout load, and the manual warns from the other direction that "high resolution image will not scale well to low resolution matrices". A Matrix definition imports as a *shell* — its name, placement and mouth positions, with no pictures — because the file names image paths on the machine that made the show |
| Singing faces — Import Lyrics, Breakdown Phrases / Words | ❌ | Turning lyrics into phonemes needs xLights' pronunciation dictionaries (`standard_library`, `extended_library`, `user_dictionary`). Without them the manual's own manual path still works — type or paste phoneme labels onto a timing track and the Faces effect runs off them |
| Singing faces — Papagayo `.pgo` import | ✅ | Each voice becomes three timing tracks — phrases, words and phonemes — with the manual's frame offset for files that were split into segments. xLights nests the three components inside one track and this app's tracks are flat, so a voice is three tracks rather than one; the phonemes track is what a Faces effect reads. A phoneme runs until the next one, and the last until its word ends. A file that doesn't line up is refused rather than half-imported: the format is count-driven, so a truncated one would otherwise import as a track that drifts out of sync partway through |
| Model states (Layout tab) | ✅ | Named sets of a model's nodes, edited on the Layout page and imported from `<stateInfo>`. Up to the manual's 40 per definition, with a one-click seven-segment set (42 predefined names) so lighting a countdown sign isn't 42 rows of typing. Each state shows live how many nodes it resolves to and how many are past the end of the model |
| Pixel editor (matrix drawing tool) | ✅ | Draws straight into the Pictures effect's image, so what's drawn renders on the model immediately — no file to save and reload. Eight colour wells, left-draws/right-erases, drag to stroke. The grid is the model's own, and it flips y so a drawing doesn't render upside down |
| Command palette | ✅ | Ctrl+Shift+K, per the manual. Searchable, ranked so a prefix match beats one buried mid-string, and every entry shows the key it also answers to — which is how anyone learns sixty shortcuts without reading a list of them |
| Keyboard shortcuts — editing them | ✅ | "These effects are stored in the xlights\_keybindings.xml file and can be modified by the user." Each effect's letter can be changed in Preferences, kept per-browser like the other preferences. A key that already places another effect is refused and says which — two effects on one key means one silently stops working, and which one is an accident of list order. Space, `t` and `s` are reserved for the transport and timing. The effect wheel shows whatever is in force, so it can't drift from the keyboard. Missing: xLights' file itself, and rebinding anything other than the effect shortcuts |
| Keyboard shortcuts | ✅ | Transport, timing (including **s** to split a mark), edit, zoom, **Shift+R** to generate a random effect, and xLights' single-letter effect shortcuts — including **u** and **d**, which are the On effect with its intensities swapped, since the manual says a shortcut can carry them ("a start intensity set to zero and and end intensity set to 100%"). The manual's table gives **s** to both Timing Split and Spirals; a structural action beats an effect, so the split keeps it and Spirals is bindable to any free key. (This row previously claimed "all fifteen"; the manual lists eighteen, which the last audit caught.) **Dividing timings**: **2**, **3** and **4** divide the marked region — or, with nothing marked, the interval the playhead sits in — into that many. The manual says only that "keyboard shortcuts are available to divide the selected timing marks by predefined intervals" and names neither the keys nor the intervals, so both are ours, and this row says so rather than implying parity. "The selected timing marks" is the play range, since that is the highlighted region we already have. An interval too short to divide is skipped whole rather than divided as far as it goes — one mark where four were asked for looks like it worked. Case is significant, as it is in xLights — **o** is On and **O** is Off. Every shortcut and every palette entry comes from one registry, so a key can't exist without a command or a command be given a key nothing dispatches |
| Render all / render on save | ⚠️ | We render on demand and on export |
| Export model as video / render-and-export | ✅ | One model's frames recorded to a video file via `MediaRecorder`. Drawn on a timer rather than as fast as possible: `captureStream` samples in real time, so racing the frames would produce a three-second video of a three-minute sequence. Uses one sequencer for the whole export, like the `.fseq` path, or every stateful effect would replay from its start on each frame |

## Chapter 4 — Built-in effects

xLights ships 56 effects — one page each under `effects/off/` in the manual's index, counted at
the last audit. We render 47.

**Implemented (47):** Adjust, Bars, Butterfly, Candle, Circles, Color Wash, Curtain, Faces, Fan,
Fill, Fire, Galaxy, Garlands, Kaleidoscope, Life, Lightning, Lines, Marquee, Meteors, Morph, Off,
On, Piano, Pictures, Pinwheel, Fireworks, Music, Plasma, Ripple, Shape, Shimmer, Shockwave, Single
Strand, Sketch, Snow Storm, Snowflakes, Spirals, Spirograph, State, Strobe, Tendrils, Text, Tree,
Twinkle, VU Meter, Warp, Wave.

**Faces** is implemented for all three definition types. The two node-range ones — "Single Node"
(dumb RGB coro faces) and "Node Ranges" (smart-pixel coro faces) — light named sets of the model's
nodes. **Matrix** draws a picture per mouth position, with the manual's Centered and Scaled
placement and an optional separate picture for closed eyes. Mouth positions, eyes
(open/closed/automatic/off with blink frequency and length), the outline, "suppress when not
singing" with lead-in/lead-out frames and fading, Transparent Black, and the manual's six-swatch
palette mapping are all in.

One setting is deliberately absent: **Suppress Shimmer** skips a `-shimmer` tag whose shimmer this
engine doesn't render, so the face already behaves as though it were always checked. (Transparent
Black was in this paragraph too while only node-range faces existed — correctly, since they never
write a pixel they weren't asked to. Adding matrix faces made it a real setting, and it is now
implemented rather than explained away.)

The phoneme names are **data, not a fixed list**: the manual only shows them in screenshots, so a
hardcoded set would be a guess that silently mismatched an imported definition. A new face is
seeded with the standard set and every name is editable.

**VU Meter** now renders 37 of the manual's ~39 types, up from 7. The addition that mattered was
structural rather than arithmetic: fourteen of its types are driven by a *timing track*, and
effects could not read one until the State and Piano work added that plumbing — so they became
routine without anything in the VU Meter itself changing. Also added: On, Color On, Pulse, Level
Jump, Level Jump 100, Level Pulse Color, Spectrogram Peak and Spectrogram Line. The jump types
decay from the moment the level crossed the threshold, looked up from the analysed audio rather
than kept as state, so a scrub and an export agree. The Note/Node family and the two Dominant
Frequency Colour types are in too: they are given a *note range* rather than band indices, which
means resolving notes to the frequencies the analysis actually banded — so the analyser now records
where its bands sit in hertz, and a series that doesn't say renders nothing rather than quietly
widening to the whole spectrum. **Level Shape** is in as well, drawing the Shape effect's own geometry at a size the audio decides
— one set of shapes rather than two that could disagree about what a candy cane looks like, filled
or unfilled as the manual offers. **Frame Waveform** now draws the frame's actual wave: the
analysis keeps a sixteen-bucket min/max envelope per frame, which is the shape of the wave rather
than a summary of it, so it is asymmetric the way audio is. **All of the manual's VU Meter types
are implemented.**
The type this app called "Spectrum" is now the manual's "Spectrogram"; sequences that say the old
name still render.

**State and Piano** are driven by the words on a timing track rather than by their own parameters,
which is a shape nothing else in the engine had. Both were previously listed here as blocked on
"definition files"; re-reading their manual pages showed neither is. State's definitions are
"Single Range or Node ranges" — the same node-range notation sub-models already use — so they are
now a property of the model, editable on the Layout page and imported from `<stateInfo>`. Piano's
notes come from "a timing track source... this is the preferred option", whose labels are key
letters or MIDI values. **MIDI file import now exists too** — a `.mid` becomes a timing track — so
all four of the manual's notes sources are covered except the Audacity label file and xLights' own
polyphonic transcription, which is an audio-analysis feature rather than an effect one.

State implements all four modes (Default follows the track, Iterate loops the labels evenly,
Countdown and Time Countdown drive a seven-segment sign), all four colour modes, and Force Custom
Colors per state. Piano implements both types, the MIDI range, sharps, vertical scale and
horizontal offset, and falls back to the analysed spectrum when no track drives it.

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

**Missing, needs a definition file (1):** Guitar (a tab/track).

(Shape now draws all eleven of the manual's geometric shapes — Circle, Square, Triangle, Diamond,
Star, Polygon, Heart, Tree, Candy Cane, Snow Flake, Crucifix and Present — and every setting on its
page except one: Points, Rotation, Random Location, Random movement and Fade Away are all in.
Emoji and the system-font glyphs are the exception: this engine has no font beyond its own 5x7
bitmap, and a circle standing in for an emoji would be a worse answer than none.)

**Missing, needs infrastructure we don't have (3):**
Duplicate (renders another model's layer), Moving Head + Servo (DMX fixtures).

**Deliberate non-goals (4):** Shader (ISF), Liquid (physics), Glediator, Video.

## Chapter 5 — Menus

| Feature | Status | Notes |
|---|---|---|
| New sequence, sequence settings | ⚠️ | Another ✅ with an empty note, and the emptiness was the tell: **there was no way to change a sequence at all after creating it** — not its name, not its length, not its frame rate. The API had create, save-body and upload-audio and nothing else. The dialog's **Info/Media** tab is in: name, Sequence Type ("Media or Animated"), duration, timing, and **Allow Blending Between Models** — "decides whether effects from the model groups blend with model level effects", which turned out to name behaviour the renderer already had half of. Off (the default, and what it did before) a model's own effects replace the group wherever they draw; on, they composite over it, so a half-lit model lets half the group through. The **Metadata** tab is in whole: author, email, website, song, artist, album, music URL, comment. Saved separately from the body — the body autosaves on every drag and carries an etag, where these are deliberate changes, and putting them on the undo stack would mean Ctrl+Z could silently change the frame rate. Missing: the **Timings** tab's VAMP plugins (the tab's other half, generating and importing timing marks, is the Timing panel here), **Data Layers** (importing another sequencer's rendered output as a layer, with Erase/Canvas render modes and layer precedence), and the **Images** tab's embedded-image management |
| Preferences | ⚠️ | A Preferences panel with the settings that drive something here: time display format, default effect length, and the autosave interval (0 turns it off). Kept per-browser rather than with the project — a preference belongs to the person at the keyboard, and one that travelled with the show would let two people editing it change each other's. xLights' remaining Settings tabs configure machinery this app doesn't have (output devices, backup paths, services); offering them would be controls with nothing behind them, and a test asserts no such preference exists |
| Settings — Backup | ⚠️ | **Purge Backups Older Than** is in, for **both** histories. It turned up a real gap: nothing purged *sequence* snapshot history at all, and while layout snapshots did cap their automatic ones by count, the manual ones grew without limit and the retention setting reached neither — a setting that silently governs one of two things reads as though it worked. Every version ever taken was kept, and autosave drives them, so a season's editing accumulates a full copy of the sequence body every few minutes. Retention had no expression in the app or the API. The manual's own windows — Never / 365 / 90 / 31 / 7 — with **Forever as the default**: deleting someone's history is not a thing to start doing because a setting was added. The most recent snapshot is always kept whatever its age, because a rule that can empty the history turns "keep less" into "keep nothing", and a backup has to survive not being used for a while. Purging runs when a snapshot is taken, which is the only moment the history grows. *Backup On Save* is the existing snapshot-on-save preference. Not applicable: *Backup On Launch* (no launch), *Backup Subfolders*, *Backup Directory* and *Alternative Backup Directory* — filesystem paths a browser has no equivalent for |
| Settings — Services | 🚫 | AI service configuration: an API key for a hosted model (ChatGPT, Claude, Gemini), a base URL for a generic OpenAI-compatible endpoint, model and image-model pickers, and per-feature enables for Colour Palette, Images and Mapping. Not a parity gap: this configures *xLights' own* AI integrations, which are features this app doesn't have rather than settings it is missing. If those features are ever wanted here they are their own project, and the configuration would follow them |
| Settings — Output | 🚫 | Live-output machinery this app doesn't do: ArtNET/E1.31 frame sync, forcing a local IP for a network adapter, duplicate-frame suppression to cut network traffic, and the xFade/xSchedule instance picker. Read rather than assumed, which is the point — the previous blanket dismissal of the Settings tabs was wrong about three of them |
| Settings — Sequences | ⚠️ | Read after the previous note dismissed the remaining Settings tabs unread. **Default Sequence Duration and FPS** and **Default Model Blending** are in — and building them turned up that **an animated sequence could not be created at all**: the type has existed since Sequence Settings landed, and every path to a new sequence went through picking an audio file, so "animated" was reachable only by changing a sequence that already had a track. There is now a create path with no audio, which is what the duration default is *for* — a sequence with a track takes its length from the track, which is the right answer and not worth overriding. Still missing: *Default View For New Sequences*, which needs a sequence to remember a view; views are a per-layout list here and nothing on a sequence points at one. *Auto Save Interval* is covered by the Autosave preference. Not applicable, with reasons: *Render On Save*, *Render Cache* and its directory, and *Save FSEQ On Save* all describe a persistent rendered copy that can fall out of date, where this renders on demand (see Render All); *FSEQ Version/Directory* and *Media/Resource Directories* are filesystem paths a browser has no equivalent for. *Low Definition Render* — "models like matrixes and trees can be set to render at a smaller resolution to help lower render times" — is a real technique we don't have and is worth considering on its merits |
| Settings — View | ⚠️ | **Timeline Zooming** is in: "zoom in on the Sequencer Timeline based on the Play Marker or the Mouse Cursor Location", which is exactly the choice the zoom anchoring made silently. Cursor by default — a zoom made with the mouse is aimed at something. Missing and applicable: *Play Controls On Preview* (transport on the house preview), *Auto Show House Preview* while playing, *Hide Preset Preview*, and *Tool Icon Size* if the effect palette ever becomes icons rather than text. Layout-tab items — *Model Handle Size*, *Grid Center Crosshair Size*, *Zoom to Curser*, *Disable key acceleration* — are real but belong to that tab's own audit. *Enable Base Show Folder Settings* is show-folder machinery with no equivalent here. **And a correction**: this tab names an *Effect Assist Window* with Always On / Always Off / Auto Toggle. An earlier row said the manual describes no Effect Assist panel — true of the *Changing An Effect* page, and wrong about the manual. It exists, we don't have it, and it is a gap rather than an absence |
| Settings — Other | ⚠️ | Mostly desktop machinery with no equivalent: crash-report email, GPU video decoding, shader threads, batch-render prompts, the vendor download cache, controller ping interval, tip-of-the-day. Two apply to Package Show and one is now in: **Exclude Presets** — "all effect presets are stripped from the xlights_rgbeffects.xml file" — because a package is usually made to hand to someone else, and presets are the personal part of a show where the sequences and layout are what they want. **Exclude Audio** needs nothing: this package has never carried audio, and says so. *Video Codec* and *Bitrate* apply to the house-preview video export we have, and are missing |
| Settings — Colors | ✅ | The app's own chrome colours: timing-track headers, timing marks, effects and selected effects, row headings, gridlines, the waveform, and the layout's model/selected/overlap colours. Reset, export and import, as the dialog offers. **This row was missing from this inventory entirely** — found by re-reading all 176 pages rather than by working the list |
| Settings — Effects Grid | ✅ | A whole Settings tab we didn't have — the same failure mode as the Colors row above, found the same way. **Spacing** (Extra Small to Extra Large) sets the grid row height, which was a hardcoded 28px; xLights names the sizes without giving pixel counts, so the heights are ours. **Small Waveform** halves the waveform, since it and the grid share the vertical space and on a laptop that is a real choice. **Display Transition Marks** draws each effect's in and out reveals as wedges — an effect with a two-second fade otherwise looks exactly like one without. **Double Click Mode** picks what double-clicking a timing mark does: play that interval (looped, via the play range) or open its label for editing, which is also the Edit Label dialog we lacked. **Snap to Timing Marks** moved here from the general settings, where the manual has it. Missing on purpose: Icon Backgrounds and Node Values describe drawing this grid doesn't do, the render-completion bell belongs to a render that happens on a server, and Hide Colour Update Warning hides a warning we don't show |
| Backup and recovery | ⚠️ | Sequence version snapshots, plus **Package Show** — the whole project in one zip: models with their sub-models, states and faces, groups, controllers and every channel assignment, view objects, sequencer views, effect presets, the layout backdrop, and every sequence body. Restoring says what came back rather than only how many sequences, so it can be checked instead of assumed. A restored sequence keeps its audio *filename* and the track is re-picked — **which is also what xLights does**: its Backup copies "all the '\*xml' files from your show directory", and the manual advises separately backing up "media files that may have amended with audacity, GIF or JPEGs etc". So the audio gap here is the same gap there, not a shortfall against it. **Backup on Save** is in too — "If you have enabled Backup on Save, it will also take a snapshot
after every Save operation" — as a preference that is *off* by default, because a save in xLights
is a deliberate act where every model drag here saves immediately. Plus **layout snapshots**: the whole layout — models with their sub-models, states and faces, groups, view objects, views and presets — taken automatically every few minutes when something has changed (the interval is a preference, as xLights' 3/10/15/30 is) and on demand, with restore. That closes the half of the manual's periodic backup that mattered here: "the xlights\_rgbeffects.xml is backed up... This includes the layout as well". Restoring matches models **by name**, so the ids sequence bodies point at survive; models added after the snapshot are removed, because a restore that kept them would be a merge. Automatic snapshots are pruned to the last 20; ones taken deliberately are never pruned. Missing: xLights' timestamped `_onstart` folder each launch, F10/F11, and Backup on Save. Package Show is still a file you take and keep rather than a dated folder written for you. File > Restore Backup restores in place; importing a package here creates a *new* project instead, which is safer but is not the same gesture |
| Tools — Test | 🚫 | Channel test patterns sent live to controllers. A browser can't open a UDP socket, so E1.31/DDP output can't come from this app at all — which is why FPP Connect uploads a `.fseq` to a player instead. Genuinely blocked rather than not done |
| Tools — Convert | ✅ | `.xsq` → `.fseq` without creating a sequence. It uses the *importer's own* mapping, on purpose: a converter that mapped differently would produce a file that didn't match what importing the same sequence would show, and trusting the two to agree is the whole reason to convert rather than import. Frame rate and length come from the file being converted, never from this project |
| Tools — Generate custom model | ✅ | From a picture of the prop: bright pixels become nodes, with a threshold, a grid width, and the four wiring orders. Each cell takes the *brightest* pixel of the block it covers rather than their average — a single-pixel wire frame averaged over a block disappears, and a wire-frame prop is exactly what this is for |
| Tools — FPP Connect | ✅ | Upload + playlist sync |
| Tools — Lua scripting | 🚫 | Automating xLights from Lua scripts. Marked as a non-goal rather than as work: it needs a Lua interpreter in the browser and, more to the point, an API surface for scripts to drive — a scripting language with nothing scriptable behind it would be the feature in name only. (This row previously gave no reason at all, which the last audit caught) |
| View — perspectives | ✅ | Saved arrangements of which panels are showing. Applying one closes what it didn't have open as well as opening what it did — a half-applied arrangement isn't the arrangement. A panel name the app no longer has is dropped on load rather than restored as a panel that doesn't exist |
| View — windows (detachable panels) | ⚠️ | Panels can be torn off into their own window, synced over `BroadcastChannel` like the popped-out preview, on a real route so they survive a reload and can be bookmarked onto a second screen. The video export panel uses it; the others are still docked |
| Import — sequence, effects from another sequence | ⚠️ | `.xsq` import with the mapping dialog: every model and group in your layout gets a row and you say which of the donor's rows feeds it, with the donor's effect counts shown because that is what the choice is made on. Names are matched for you as a starting point — exactly, then case- and space-insensitively — and nothing fuzzier, since a wrong guess puts someone else's effects on the wrong prop. One donor row can feed several of your models. Timing tracks are ticked separately. Mappings save and load, and a loaded one can replace or add to what's there. Missing: the other donor formats (LOR, SuperStar, Vixen, HLS, LSP, VSA), AI auto-mapping, Convert to Per Model, and submodel aliases. The saved mapping is this app's own JSON (`.xmap.json`) — xLights' `.xmap` isn't documented in the manual, and guessing at it would produce files that look interchangeable and aren't |
| Audio menu | ⚠️ | Loading and replacing a sequence's track is on the Sequencer page. xLights' menu also offers waveform-derived timing generation beyond interval/BPM, which needs onset detection this app doesn't have |

## Chapter 4 — Controllers tab

| Feature | Status | Notes |
|---|---|---|
| Controller list, add, delete | ✅ | |
| USB / Ethernet / NULL controller types | ⚠️ | Generic controllers with a start channel and count |
| Controller visualiser | ⚠️ | A channel-by-channel view of what's assigned where, per controller, with free space, overruns and — the reason to have it — **channel collisions between models on the same controller**. Nothing else in the app surfaces those: each assignment is checked against the controller's span when it's made, never against the other models already on it. Missing: xLights' physical port/string breakdown, which needs per-port controller definitions this app doesn't model |
| Auto start-channel allocation | ✅ | First-fit packing of every unassigned model into the first active controller with room, starting after everything already there. Existing assignments are never moved — a hand-placed model is usually where it is because a physical port starts there. Reports what it couldn't place and why |

---

## What is left, and why

One row still reads ❌, and it is the one that can't be fixed from here: the **vendor model
library** needs xLights' own web service, which is a third-party network dependency rather than a
piece of app work.

**Tools > Test** is marked 🚫 for a harder reason. It sends E1.31/DDP live, and a browser cannot
open a UDP socket at all — no amount of work here changes that. It is why FPP Connect uploads a
`.fseq` to a player instead of streaming to controllers.

Everything else that was ❌ has been built: Tools > Convert, export model as video, and
detachable panel windows.

Two of the effects previously listed as blocked turned out not to be. **State** and **Piano** were
both recorded as needing "definition files"; their manual pages say otherwise — a state is defined
with the same node-range notation sub-models already use, and Piano's preferred notes source is a
timing track. Both are now implemented, which is a reminder that a blocked row is worth re-reading
rather than inherited.

**Faces went the same way.** It was listed as needing "a picture per mouth position" — true only of
its Matrix type, and that turned out to be a smaller piece than it sounded, because the Pictures
effect's image decoding and sampling already existed. All three definition types are now
implemented. What remains of singing faces is the lyric-to-phoneme breakdown (a pronunciation
dictionary) and Papagayo import — neither of which is the effect.

The eight effects that remain: **Guitar** needs a tab or track file; **Duplicate** needs to render
another model's layer; **Moving Head** and **Servo** are DMX fixtures; **Shader**, **Liquid**,
**Glediator** and **Video** were recorded as non-goals at the start and remain so.

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


## Sequencer windows (View > Windows)

The `windows.md` page turned out to be a pointer — "the Windows are described in the View, Windows
section" — and the child page lists fifteen panels. Read via the sitemap, which is the habit that
has now paid off three times.

| Panel | | Notes |
|---|---|---|
| Display Elements, Model Preview, House Preview, Effect Settings, Color, Layer Blending, Layer Settings, Effect Dropper | ✅ | All present, under different names in places — the Effect Dropper is our effect palette |
| **Select Effect** | ✅ | "Select effects based on type, model, and time" for bulk editing. **Now in.** Block selection could already draw a box, and a box only finds what happens to be adjacent on screen; a criterion reaches every Fire in the show, or everything on the mega tree. Criteria combine with AND because that is the only combination anyone can hold in their head. Time is the marked play range rather than two typed numbers, since the range is already the highlighted region. The time test is *overlap*, not containment: an effect running through the chorus is part of the chorus, and requiring it to start and end inside would miss the long pad that is usually what you were after. The panel says what it will select in a sentence, because the risk is selecting more than you meant and then aligning or recolouring it in one go |
| Value Curves, Color Dropper | ⚠️ | We have value-curve and colour-curve *editors* per effect, but not the saved libraries these panels drag from — "drag and drop their saved values curves onto the desired effect setting" |
| Effect Assist | ⚠️ | "Helps you determine how an effect is being drawn via a panel view", with grid coordinates for precise adjustment. Our Pixel Editor and Sketch editor are this for the two effects that most need it; what is missing is the general panel and its coordinate read-out |
| Video Preview | 🚫 | Previewing the video file being sequenced against — the Video effect is a deliberate non-goal |
| Jukebox | ⚠️ | Fifty buttons linking effects for real-time playback. The effect-preset library is the same idea without the live-performance half |
| Perspectives | ✅ | Saved window arrangements, which we have |

## Effects the registry didn't have

The unaudited list named five effect pages for effects we might not have. Checking the registry
first, rather than assuming: **Adjust** and **Kaleidoscope** were already there. Three weren't.

| Effect | | Notes |
|---|---|---|
| **Guitar** | ✅ | "Turns MIDI note data into an animated stringed-instrument visualization... and can be styled as a guitar, bass guitar, banjo or violin." **Now in**, and buildable because the hard part already existed: a MIDI file imports as a timing track whose labels are the keys sounding, and the Piano effect already reads exactly that. A note is placed on the *highest* string that can reach it, which is how it is actually fingered — middle C on the B string at the first fret, not the low E at the eighth. Picking the lowest string instead would send a melody sliding down the neck as it rose in pitch, which is both wrong and unreadable. Standard tunings for all four instruments; a note the instrument can't reach, or one past the last drawn fret, is dropped rather than rendered somewhere it isn't |
| Duplicate | ⚠️ | "Copy Effect Data from another model. Each Individual Layer has to be 'duplicated'." A source model, submodel or strand and a layer number, plus four switches deciding whether this effect's palette, colour settings, blending and layer settings override the source's. Every piece it needs now exists — layers, strands, and the resolution step that hands an effect its data — but it reads *another row's effects at render time*, which nothing else does; that is the change, and it is worth its own slice |
| Moving Head | 🚫 | DMX fixture control, which is a stated non-goal alongside the DMX and Servo effects |

## Pages not yet audited

Three whole sections have now been found missing from this inventory rather than marked
incomplete in it — Settings > Colors, Settings > Effects Grid, and Layer Settings > Roto-Zoom.
Each was found by reading a manual page and noticing there was no row for it, which is luck
dressed up as method: a section nobody reads about stays missing forever.

So this is the manual's own page list, filtered to the pages no row here corresponds to. It makes
the remaining audit enumerable instead of discovered.

**Settings tabs.** ~~`settings/view.md`~~, ~~`settings/sequences.md`~~, ~~`settings/other.md`~~ —
audited, and the dismissal was wrong: all three held applicable settings, one of which (Timeline
Zooming) named a choice the app was already making silently. ~~`settings/output.md`~~, ~~`settings/backup.md`~~ and ~~`settings/services.md`~~ are read too — Backup held the
snapshot-retention gap; Output was genuinely all live-output machinery; Services configures xLights' own
AI integrations. **All six Settings tabs are now audited**, and the blanket dismissal that covered them
was wrong about half.

**Layout tab.** `layout-preview.md`, `editing-layout-preview.md`, `moving-model-objects.md`,
`download-import-models.md` (the vendor model library, a known gap), `models/model-attribute.md`
and its `changing-start-chanel.md` child, plus the fourteen per-model-type pages.

**Sequencer.** ~~`windows.md`~~ (and its real content in `view/windows.md`) is read. Still unread:
`views.md`, `models.md`, `effect-presets.md`, `pixel-editor.md`, `value-curves.md`,
`timing-tracks.md`, `singing-faces.md` and its `adding-word-to-user-dictionary.md` child.

**Tools.** `lua-scripting.md`, `generate-custom-model.md`, `convert.md`.

**Menus.** `edit.md`, `view.md`, `view/windows.md`, `view/perspective-definition.md`, `import.md`,
`audio.md`.

**Elsewhere.** `chapter-six-advanced-features.md`, `appendicies/keyboard-shortcuts.md` — an
appendix distinct from the sequencer's own shortcuts page, and worth checking against the
shortcuts row — and `appendicies/glossary.md`.

~~**Effect pages**~~ — all five checked against the registry: Adjust and Kaleidoscope were already
there, Guitar is now built, Duplicate is recorded with what it needs, Moving Head is a non-goal.

A page appearing here means no row cites it, not that the feature is absent — several will turn
out to be covered by a row named differently. The point is that each has been *looked at* rather
than assumed.

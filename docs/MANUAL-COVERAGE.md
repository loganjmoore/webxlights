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
| Timeline + waveform, zoom, scroll | ⚠️ | 3 zoom levels. **Play range**: shift-drag the waveform to mark a section and it plays on its own, looping — "when it reaches the end of the area, will loop back to play from the beginning of that area", which is the point of it, since working on one chorus means hearing it repeatedly. Play jumps into the range rather than ignoring the highlight, and carries on from where it is if already inside, so pausing mid-phrase doesn't throw you back. Marked with shift rather than a plain drag because a plain drag here already scrubs the audio, which xLights' waveform doesn't do — trading that away for a more familiar gesture would be the wrong way round. Missing: xLights' separate *timeline* selection, draggable range edges, double-click and ctrl+wheel zoom gestures, right-click to reset zoom, and shift+wheel scrolling |
| Audio scrubbing | ✅ | Drag the waveform and the track plays under the pointer, in short bursts. The burst is stopped on a timer rather than left running: a scrub that kept playing would drift away from the pointer within a second, and dragging back would then be seeking against audio that had moved on |
| Time display format | ✅ | Minutes:seconds, plain seconds, or frames — frames counted against the sequence's own frame rate, since a 20ms sequence and a 50ms one number the same second very differently |
| Timeline tags | ⚠️ | A region boundary is a named point on the timeline, which is what a tag is; xLights' separate tag list, with its own colours and independent of the section structure, isn't offered |
| Timing tracks | ✅ | Fixed interval + metronome generation, marks added and deleted on the ruler, split at the playhead, and divided by 2/3/4. A mark's label is editable from the grid (double-click, with Double Click Mode set to Edit Text). Labels are positional — `labels[i]` belongs to `marks[i]` — so every edit to the marks moves the labels with them; inserting one without doing so put every later word on the wrong phrase, silently, which is the bug subdividing a lyric track would have hit first |
| Audio-generated timing tracks (beats/bars/lyrics) | ⚠️ | Beat detection over the analysed audio: spectral flux against a *local* baseline, so one setting works across a quiet verse and a loud chorus. Sensitivity, a minimum gap (one drum hit is one mark, not a cluster), a spectrum range (low follows the kick, high the hats) and keep-every-Nth, which is roughly how bars come from beats. The estimated tempo is reported but never acted on — it answers "did this find the beat or find noise?", and using it to snap marks would move real ones to wrong places. Still missing: true downbeat/bar detection, and lyric tracks, which need the pronunciation dictionaries |
| Timing track from a Papagayo file | ✅ | See "Singing faces — Papagayo `.pgo` import" below |
| Timing track from a MIDI file | ✅ | A `.mid`'s notes become a timing track whose cells are labelled with the keys sounding in them — which is what the Piano effect reads, so this is how its "Midi file" notes source works here. Reads formats 0/1/2, running status, tempo changes (pooled across tracks, since format 1 keeps them in the first one) and SMPTE division. The Track picker and the manual's own Midi Start Time Adjust and Midi Speed Adjust are applied at import, because they describe the file rather than the rendering. Note ends are boundaries as well as note starts, so a held note stays pressed while the melody moves over it |
| Adding effects (drag, double-click, drop) | ✅ | A ✅ with an empty note, which is how this one hid. **A dropped effect now fills the interval it lands between** — "release it between two timing marks on the row of the model you wish the effect to play on". We had the rule backwards: the fixed length is the manual's *fallback* for having no marks to land between ("the effect defaults to 1 second long"), not the rule, so dropping an effect on a beat gave something that had to be dragged to fit the beat it was dropped on. Strictly between two marks — a drop past the last one gets the default rather than running to the end of the song. The radial wheel places the same way, since it is the manual's other way of doing the same act. Also here: **the selected timing track**, which the manual leans on ("if no timing track is selected...") and we had no notion of. It decides where a drop lands, what snapping snaps to, and which track a new mark or a division goes on; "All tracks" keeps the old merged behaviour. Every track's marks are still drawn, the ones in force at full strength — an effect snapping to a mark that looks like one it ignores reads as broken snapping. That selection also fixed a silent bug: right-clicking a mark on the second track reported it as track 0's, so Delete Mark filtered a track for a millisecond it didn't have and did nothing |
| Radial effect wheel | ✅ | Double-click empty grid, per the manual. Opens where the pointer already is, so the whole gesture is double-click, flick, release — which is what makes it worth having over a menu. Offers the same effects as the single-letter shortcuts, from the same list, so the wheel and the keyboard can't drift apart |
| Changing effects, moving/stretching, aligning | ⚠️ | Move and resize with the mouse, and — new — with the keyboard: "select the effect and use the Left or Right arrow keys to move it left or right", with Up and Down moving it between rows. The manual's jump rule is honoured, and it is the point of the feature: "when the effect encounters or is blocked by another effect, if you keep going, it will jump over the effect/effects and continue past", so a packed row stays navigable. A vertical move onto an occupied slot is refused instead, since there is nowhere for it to jump to. Arrows still nudge the playhead when no effect is selected. Missing: align commands, Alt-drag stretching, and the ghost outline xLights draws while dragging |
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
| New sequence, sequence settings | ✅ | |
| Preferences | ⚠️ | A Preferences panel with the settings that drive something here: time display format, default effect length, and the autosave interval (0 turns it off). Kept per-browser rather than with the project — a preference belongs to the person at the keyboard, and one that travelled with the show would let two people editing it change each other's. xLights' remaining Settings tabs configure machinery this app doesn't have (output devices, backup paths, services); offering them would be controls with nothing behind them, and a test asserts no such preference exists |
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

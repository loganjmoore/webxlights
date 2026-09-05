# Changelog

## A controller visualiser, shader favourites, a monthly allowance, and Sonnet 5

The Controllers page has the visualiser xLights users expect: every controller as a row, its models chained along it in channel order, and a tray of models that are on no controller yet. Drag a model onto a controller and it joins the end of the chain; drop it between two others and everything after shuffles along; drag it back to the tray and it comes off. A model that will not fit is refused before the drop, with the row turning red and saying how many channels are free. The arithmetic (`lib/controllerChain.ts`) is tested on its own; the page writes only the models that actually moved and shows the result before the writes land. Verified in real Chrome: chaining onto two controllers, reordering, taking one off, and a 768-channel matrix correctly refused by a 600-channel controller.

Shaders can be starred. A star on each card, a "My favourites" scope on the gallery, and a ★ filter in the sequencer's shader picker, so the ones you keep coming back to are one click away. The API keeps one row per person per shader; the flag on each record is per caller. Gallery thumbnails render at 96×64 instead of 48×32 - still the nearest-neighbour "what the lights will do" preview, just twice the detail on a card that is four times that size.

The shader assistant's free use is now a monthly allowance of 100 generations per signed-in person (`SHADER_MONTHLY_LIMIT`), in place of the credit balance that ran out and stayed out. Every server-funded generation is still a ledger row, so the count and any bill cannot disagree, and a failed call gives the slot back; bringing your own key is not counted. The meter says "83 of 100 free shaders left this month". The default model is Claude Sonnet 5, on Anthropic, in both the provider preset and the blueprint.

Play, Stop, Undo and Redo are icon buttons with tooltips. The controller properties panel's labels are left-aligned.

## The effect settings panel tears off too, and the palette takes less room

The docked effect settings panel beside the grid has the same tear-off control as the dialogs: a click opens it in a separate Chrome window (shift-click for a tab), the grid takes the width it leaves behind, and closing that window brings it back. The mechanism moved out of the dialog component into `lib/tearOff.ts` so both share it. Verified in real Chrome: the panel and its controls appeared in the new window, the main page showed the "in its own window" note with a wider grid, and closing the window returned the panel.

The command palette opens on Cmd+K and Ctrl+K as well as xLights' Ctrl+Shift+K, because that is the key people press. Palette tiles no longer let a native text or image drag start from the glyph, which could cancel the pointer sequence mid-drag so the drop never arrived, and a mouse release that arrives without its pointer event now counts. The controller properties panel's labels are left-aligned.

The effect palette's tiles are smaller - 44px wide with 16px glyphs - so the strip takes about a third less height.

## Panels that fit, lists you can type into, and a drop that always lets go

Every panel is now at most seven tenths of the window tall; the body scrolls inside it, and the grid underneath stays in view. The list panels - Models, the Views row picker, Effect presets - have a typeahead at the top: results are ranked closest first (exact name, then names starting with what you typed, then names containing it, then initials in order), so "tree" puts Tree above Mega Tree above Street Lights and the exact name lands at the top. The Models list hides numbered strands by default - a 16-strand matrix was sixteen rows of "Strand N" nobody sequences - and a "Show everything" switch brings them back; a strand someone has named is always listed.

A palette drop could get stuck with the lifted tile still on screen: the release handler ran the placement before the cleanup, so anything that went wrong in between left the drag armed, and a release the tile never heard about (the window losing focus, capture taken away) had no fallback. The cleanup is now unconditional, the drop reads the pointer's final position, and window-level release and blur handlers end the drag when the tile's own cannot. The layout's model palette got the same treatment. Verified in real Chrome: drops onto a row, the far end of a row, the ruler, and off the grid all release cleanly.

## The first page, and the page where you pick a file

The page after login was a text box and a list of underlined names. It is a home now: **Projects** as a grid of cards, each saying how many sequences it holds and when it was last touched, opening to its sequences with one click and to Layout, Sequences or Network from its footer, with Share and Export behind a small menu. "New project" is a button that asks for a name when you want one, not a form that is always there. A brand-new account gets a welcome that explains what a project is and offers the three ways in - the sample show first, because it shows what the app is before asking for a single file - and tells someone coming from xLights where their two files go.

The Sequences page was a "New sequence" form sitting above a list of links. It is a file list now: name, length, frame rate, audio file or "animated", when it was last edited, and Open, sorted by most recently edited. "New sequence" is a dialog (the same movable, tear-off panel the sequencer uses) with the audio file first, since the file is what a sequence is made from. The list endpoint stopped sending every sequence's whole body just to draw names.

The app bar now says which project you are in: `webXLights / jinglebells`, and the name is the way back to that project's sequences. The sequencer grid and the layout canvas are untouched.

## One chrome on every page

Every page now has the same two rows at the top, in the same place, at the same height: the app bar (wordmark, the four workspaces, Docs, account) and a page toolbar with the page's name first, then its actions in the order you use them, then status on the right. The toolbar is one global pattern (`.page-toolbar` in `style.css`) rather than six pages each drawing their own header, which is how the Layout, Sequences, Controllers, Shaders, Sequencer, Projects and Docs pages had come to differ in padding, alignment, button size, and where the actions sat. The Shaders page's paragraph of introduction became one line in its toolbar; the Docs page lost a "back to projects" link the wordmark already is. The Layout sidebar's three tabs became a segmented control with count badges instead of three buttons wrapping their "(758)" onto a second line. Verified by screenshotting the top of all seven pages at 1440 and 1024 wide and comparing them side by side.

## Any panel can be torn off into its own window, and comes back when it closes

Every settings panel now has three window controls in its title bar: tear off, pin, close. Tear off moves the panel into a browser window of its own (shift-click for a tab): not a copy rendered from a second route, but the very same DOM nodes teleported into the new document, so the panel keeps its state, its store and whatever you had half-typed, and nothing inside it had to change. Verified in real Chrome: the Models panel left the main page, appeared in the new window with its rows, a checkbox clicked there changed the main page's grid, and closing the window brought the panel back where it was. A blocked popup says so in the title bar. Panels are also resizable from their corner whether centred or floating.

The Preferences panel lost its duplicated heading, its cramped shortcut list, and a now-redundant "open in its own window" button for the video export; the video export section's heading and note are styled by the component itself, so they look the same in the panel and in a window.

## The library is complete: fifty of fifty

Fifty built-ins exposed a gap the gallery had quietly had all along: the API pages at 24 and nothing on the page could reach page two. The gallery and the sequencer's shader picker now append a page at a time behind a "Show 24 more of 50" button.

The last ten: mesh gradient, liquid metal, iridescent silk, neuro noise, ink bloom, voronoi crystal, moire drift, smoke plume, plankton glow and dust storm - the motion-background family the brief called the reference aesthetic, built for props first. Fifty of fifty compile in both dialects and clear every fitted gate at every shape; the closest pair is 0.081 apart. The distinctness gate did most of the work this round: plankton and twinkle, comet and neuro noise, moire and peppermint, marquee and snowfall all measured as statistical neighbours and were pushed apart by design changes (bigger specks in a brighter sea, denser filaments over true black, deeper dark bands), never by lowering the floor. One move went the wrong way and was reverted, which the numbers made obvious inside a minute.

## Forty built-in shaders

Ten more: icicle drip, kaleidoscope, lightning, sunrise, ember rise, lava flow, halftone pulse, caustics, cloud drift and god rays. Forty of forty compile in both dialects and clear every fitted gate at every shape; the closest pair is 0.084 apart. The distinctness gate earned its place this round: it flagged ember rise as statistically too close to radar sweep and cloud drift too close to peppermint swirl - pairs no eye would confuse - and both were pushed apart (a brighter, faster ember field; a darker sky under whiter clouds) rather than the gate being loosened. The other by-eye tune was a kaleidoscope whose cells were too small to read at 32x32.

## The layout palette drags the same way, and the library reaches thirty

The Layout page's model palette was the last native HTML5 drag in the app. It now uses the same pointer-captured gesture as the effect palette: the type lifts under the pointer, the proxy turns green over the ground plane, Escape cancels, and release creates the model where the ray meets the plane. `LayoutCanvas3D` exposes one method (`worldAt`) instead of owning a drop handler, so the palette knows nothing about cameras. Verified live: a Star dropped on the 3D canvas landed at the pointer and appeared in the model list.

Ten more built-in shaders: barber spiral, diagonal wipe, accent flash, peppermint swirl, warm white sparkle, halloween breath, independence burst, champagne shimmer, ocean swell and rain ripples. Thirty of thirty compile in both dialects, clear every fitted gate at all four shapes, and the closest pair is 0.09 apart. Tuned from the contact sheets: a wipe whose "hard edge" was three pixels of gradient, fireworks that were too dim between bursts, and a sparkle that read as sand.

## A menu bar, panels you can pin, and a shader library that actually exists

The sequencer's header had become twenty-two buttons in two wrapping rows, every panel and every export at the same weight, and the tab strip that moved between Layout, Sequencer, Network and Shaders sat in a different place on every page. Now one app bar (`AppBar.vue`) runs across every project page - wordmark, the four workspaces, Docs, log out - and the sequencer's toolbar is one row: transport, undo, zoom and view, then two desktop-style menus (`MenuButton.vue`). **Windows** lists every panel with a tick on the open ones and the key that also opens it; **Sequence** holds settings, preferences, snapshot and export. The Controllers page's three "Add" buttons became one "Add controller" menu. `TabNav.vue` is gone.

Every settings panel (`ModalPanel.vue`) can now be dragged by its title bar, pinned so the backdrop goes away and the grid underneath stays live, resized like a window, and put back in the middle with a double-click. Where a panel was left is remembered per panel (`lib/panelPositions.ts`), clamped so a position from a bigger monitor still leaves the title bar on screen. Panels that already have a window route (the house preview, the video export) are reachable from the Windows menu as their own browser windows.

The effect palette is a toolbox instead of a row of unlabelled 30px glyphs: fixed-width tiles with the icon and the name. Dragging a tile no longer uses HTML5 drag-and-drop, which hands the gesture to the OS - a washed-out screenshot of the button, a "copy" cursor, throttled updates, and nothing drawn until the drop. It is pointer-captured now: the tile lifts under the pointer with a shadow, the grid draws a snapped outline exactly where the effect will land - green when it fits, red when something is in the way, the same ghost the manual describes for moving effects - Escape cancels, and release is one undo step. Testing that found a real, older bug: a strand or sub-model row drew every sibling's effects, because the grid's row lookup matched on model and type but never on the sub-name. One condition, fixed.

The shader assistant's prompt was designed around a one-pixel-tall roofline and produced effects that were safe on a line and dull on a matrix. It now designs for the matrix first - one subject, two layers, big flat saturated shapes from the palette with crisp edges, true black as negative space, aspect-corrected coordinates - and keeps the line-branch rule for rooflines. The three prompt candidates that `docs/SHADER-LIBRARY.md` had measured but could not verify are in it: the animated value must reach `gl_FragColor` (the static comet), never feed raw `TIME` into a hash or high-frequency sine (the ten-hour decay), and open bright. The user says which prop it is for ("Designed for: a matrix / a roofline / a mega tree / any prop"), which the model is told in one sentence, and the shaders page offers six example descriptions that generate well. This is stated plainly: no model credentials exist on the machine that made this change, so the new prompt is *not* measured against the 26-item corpus; `tools/shader-check/generate.mjs` will do that for anyone with a key, and the results directory is where the number goes.

The built-in library, which the infrastructure had been ready for since August with zero shaders in it, now has twenty: candy cane, rainbow sweep, comet chase, twinkle field, snowfall, firelight, expanding rings, radar sweep, checker slide, plasma storm, aurora curtain, metaballs, spin tunnel, starburst, flag wave, colour wash, VU bars, pixel cascade, heartbeat and marquee chase. Authored by hand, every one compiles in both dialects (`check.mjs`, xLights via glslang), clears every fitted gate at all four shapes (`metrics.mjs`), is no near-duplicate of another, and survives the ten-hour drift check; they were reviewed by eye from contact sheets at 32x32 and tuned where the numbers passed and the picture did not (a twinkle whose stars all blinked together, snow that read as static). Gallery cards now render at the header's own DEFAULTs - a candy cane with zero stripes was a solid colour - and run while the pointer is over them.

For open source: register and login are throttled per IP; audio uploads are an extension allow-list and come back with `nosniff`, so an uploaded HTML file can never run as the app; the shader payload's `inputs` and `categories` are bounded; nginx adds a Content-Security-Policy that forbids inline and third-party script (verified against a production build: sequencer, layout and shaders pages run with no violation), plus `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy and HSTS; production session cookies are `Secure` and `SameSite=Lax`; `SECURITY.md` documents the model and how to report; Dependabot watches npm, composer, actions and the base image. `DESIGN.md` records the tokens (`style.css`, which no longer carries the Vite starter template) and the rules the chrome follows.

## The sequencer grid stops painting what nobody can see

The grid and waveform canvases were as wide as the whole sequence — at a three-minute song zoomed to 0.35px/ms, a 63,140-pixel-wide bitmap. That has two costs and one outright failure. The costs: ~100MB of backing store between the two canvases, and a zoom step that reallocated and repainted all of it (195ms a step, measured). The failure: Chrome caps canvas dimensions at 32,767px, so past a modest zoom × duration product the backing store silently failed to allocate and the grid rendered *blank* — the deeper you zoomed, the less you saw.

Both canvases are now viewport-sized. A spacer div keeps the scroll range, the canvas rides the horizontal scroll pinned by transform (CSS `position: sticky` can't pin against the page's scroller from inside the component's own vertical one), and every draw subtracts the scroll offset and culls what falls outside the viewport. Redrawing on scroll sounds like the expensive direction until you measure it: both components' scroll handlers together cost 0.15ms — the old way's "free" scrolling was compositing a bitmap that mostly failed to exist. Measured on the M9 budget (100 rows / 5k effects, preview paused): zoom steps 195ms → 43ms, drag steps 18.6ms → 9.6ms median, grid bitmap 44MB → 2.4MB at the same zoom, and no zoom level can blank the grid any more. The row-label gutter is repainted last, over anything scrolled beneath it, so labels now stay readable at any scroll position — the virtualization forced what was already good UX.

The preview got the same treatment for a different verb: closing it unmounted the THREE.js scene — renderer, geometry, compiled shaders — and reopening rebuilt all of it from scratch. The popped-out preview now hides with `v-show` and a `paused` prop that stops the render loop and color updates but keeps the scene warm, so reopening is a style flip plus one repaint instead of a WebGL context negotiation.

## The render loop learns to stop re-doing its own past

A CPU profile of the M9 bench put two thirds of a full render inside the layer compositor and the garbage collector at 11% — every node of every layer of every frame allocated a colour object in `blendPixel`, another in `getPixel`, a colours array per layer, and a buffer per layer per frame. The compositor now blends in place (`blendPixelInto`, all channels read before any are written so the output may alias an input), reads pixels without materialising objects, and reuses shape-keyed scratch buffers across frames. Same pixels — all 838 engine tests unchanged — at 2.7× the speed: the medium-show budget render went from 12.0s to 4.5s, GC from 11% to 3%.

The bigger find was what live playback was doing: the preview called `renderRowAtMs` per frame, which replays every stateful effect from its start on every call — ten seconds into a long Meteors effect, *each frame* cost 483ms of replaying the previous ten seconds. `createRowPlayer` wraps the export's incremental sequencer for playback: quantised to the frame grid (so the many repaints inside one 50ms frame are free, and the screen shows exactly the export's frames), stepping O(1) per frame, rebuilding with a warm-up only on seeks. Steady-state: 1.16ms a frame, 400× faster.

Making the player provably equivalent surfaced that it couldn't be — because the two paths already disagreed. The scrubbing path's replay never cleared its buffer between replayed frames, so every stateful effect accumulated ghost pixels as if its layer were Persistent; and the export sequencer, drawing one clean frame per call, dropped persistence from layers that *were* Persistent and stateful. Both halves fixed to mean what the layer setting says, pinned by equivalence tests sweeping player against pure path through seeks in both directions. The waveform also stops reallocating its (at deep zoom, tens of thousands of pixels wide) canvas backing store on every playhead tick, the same fix the grid already documented.

## The shader assistant learns to write for xLights too, and proves it

The brief (docs/GOAL-shader-prompt.md) said the quiet part: every shader the assistant had made so far was a fork of the format. The prompt taught the model `PALETTE_AT()`, an invention of ours that real xLights has never heard of, so a "shader for xLights' own format" failed to link the moment anyone actually put one in xLights. This round makes the same file mean the same thing in both programs — and measures it instead of asserting it.

### webXLights moves to xLights, not the other way round

Reading `ShaderEffect.cpp` (commit `858a5aea73f`) settled three divergences, each fixed here in xLights' direction. Colour: xLights fills every `"TYPE": "color"` INPUT from the effect's palette, in declaration order, wrapping, DEFAULT ignored — so now webXLights does exactly that, and `PALETTE[8]`/`PALETTE_COUNT`/`PALETTE_AT()` are gone rather than deprecated. Declarations: xLights declares a uniform for every header INPUT; webXLights expected the body to self-declare, which meant *no shader with INPUTS could ever compile in both* — the host now parses the header and declares the uniforms itself, while bare-body sources (what older effects carry) compile as before. And generated drafts now keep their header all the way into the library, so what a user publishes is literally the file an xLights user drops into `Shaders/`.

### A harness instead of an argument

`tools/shader-check` compiles any ISF file as both dialects: the app's real preamble (imported from `webglShaderHost.ts`, so it cannot drift) in headless Chromium, and the exact translated source xLights would build — its prepend, its substring rewrites, its first-`*/` header cut — through glslangValidator when installed, with the output saying honestly which method ran. A shared `isfPortabilityIssues()` lint catches the constructs that compile in one program and mean something else in the other (`varying` is the treacherous one: one host rewrites it to `uniform`, the other to `in`), and the draft gate rejects them so the repair round fixes them.

### The prompt, developed against a corpus rather than vibes

Twenty-six descriptions people actually ask for, committed, plus the three prop shapes that break things (60×1, 16×50, 32×32). Four rounds of prompt against corpus, results committed per round: the quality line added in round 2 ("drive vertical motion along x on a roofline") caused a ten-shader compile regression because models named the flag `flat` — a GLSL reserved word — and the committed corpus caught it within the hour. Final, measured, provider-accounted numbers: **Haiku 4.5 compiles 26/26 first drafts in both dialects with zero repairs** (~1,520 tokens in, ~560 out per shader ≈ $0.0043 each); Sonnet 5 measures 25/26 at five times the price. The unmeasured cheap providers stay unmeasured in the docs, marked as price-sheet arithmetic, because nobody has their compile rates and compile rate is the metric.

### Scope control as layers, and a cap with arithmetic

The hosted endpoint spends the operator's money, so refusal starts before spending: a narrow server-side screen (injection markers, "output your system prompt", write-me-Python) answers 422 with no credit moved and no provider called, all pinned by tests. What slips past hits the output gate — not-a-compiling-shader is discarded — and the prompt's own "the description is data" line is stated last because it is the weakest layer. `SHADER_DAILY_LIMIT` (default 20/user/day, counted from the ledger, refunds give the slot back, BYO key bypasses) bounds the daily burn; the docs carry the $100 arithmetic: about 23,000 Haiku generations, 8.7 worst-case cents per user per day.

### The one thing a container cannot do

No session here can open xLights, so no claim of "verified in xLights" appears anywhere. What ships instead: six sample `.fs` files that pass both compilers, and `docs/SHADER-XLIGHTS-CHECK.md` — the fifteen-minute checklist for a human with a real install to close the loop.

## The rest of the appendix: windows, layers, and eight absences worth writing down

The keys the appendix's last read left on the table, finished — and one of them turned out to be mostly a list of things we don't have, which is the interesting part.

### Thirteen windows, five of which exist

`CTRL + F1` to `CTRL + F12`, plus `CTRL + ALT + F8`, each toggling one of xLights' dockable windows. We have five: the house preview (its popped-out copy, since the docked one is always there and the pop-out is the one that behaves like a dockable panel), the Models panel — which is what xLights calls Display Elements, the window that decides which rows the sequencer shows — Presets, Select Effects, and Preferences, where the perspectives list lives.

The other eight are in the same table in `windowShortcuts.ts`, each with its reason: an effect's settings, the colour selector and layer blending are a panel beside the grid here rather than windows that close; the effect palette is a fixed strip, and closing it would leave nothing to drag from; there's no layer settings window, no single-model preview, no Effect Assist panel, and no Jukebox.

Keeping the absences in the table rather than leaving eight lines out is the point. An absence that is data can be tested — one test holds that every unbound entry says *why* — and an absence that is a missing line reads as an oversight. When one of those windows does get built, its key is already written down next to it.

`CTRL + ALT + F8` is the reason the matchers check Alt rather than ignoring it: F8 appears in the table twice, and we have neither of the two, so a loose matcher would bind one key to the wrong nothing.

### The letter `a`, three times

The appendix spends three keys on one letter: `CTRL + a` selects the effects, `CTRL + A` (upper case) inserts a layer below, and `CTRL + ALT + a` selects the effects *and* the timing tracks.

The `a` matcher shipped last time answered to two of those — it took either case. Now it takes lower-case `a` without Alt, and `CTRL + A` inserts a layer below while `CTRL + I` inserts one above.

`CTRL + ALT + a` we don't have, because selecting a timing track means having a selected timing mark and there is no such state here. It deliberately matches *nothing* rather than falling through to the plain select-all — which would select the effects, skip the timing tracks, and look like it had worked. A near-miss is worse than a dead key, because only one of the two gets reported.

### Two more from the same set

**`CTRL + I` / `CTRL + A` insert a layer above and below.** The right-click menu refuses this on a collapsed row, on the grounds that "above or below the current layer" needs a current layer and a collapsed row shows them all at once. From the keyboard there always is one — the selected effect is *on* a layer whether or not the row is drawn split — so the keys work on a collapsed row and then expand it. The new layer is empty, and an empty layer you can't see is indistinguishable from a key that did nothing.

**`CTRL + X` toggles element expand.** The manual's parenthesis is "to show models in group, strands, nodes, etc", and none of that is hidden here: a group's models, a model's strands and its sub-models are all rows of their own, listed together. What a row expands *into* here is its layers, so that's what the key toggles — and the entry says so, rather than claiming parity it doesn't have.

## The shortcuts appendix, which is a different list

`appendicies/keyboard-shortcuts.md` is not the sequencer's shortcuts page with a different cover. It's a second, longer list, and reading it corrected a decision made on the shorter one.

### Spirals gets its key back

The sequencer's own page gives `s` to both Timing Split and Spirals. Faced with that, an earlier change kept the split — a structural action beats an effect — and noted Spirals as bindable to any free key.

The appendix distinguishes them: **s** is split, **S** is Spirals. Different keys, and case has always been significant here (`o` is On, `O` is Off). So Spirals has its key, and `S` is no longer reserved — reserving both was reserving one key too many.

That's the fourth time a second page has settled something the first left ambiguous. The habit is worth stating: a shortcut list that looks complete may be one of two.

### What the appendix added

- **Ctrl+Shift+←/→ — expand an effect to the previous/next timing mark.** The most useful key in the set. It's how an effect gets snapped to a beat without dragging, and dragging can only be as precise as the zoom allows — at a working zoom a 50ms frame is a pixel wide. It acts on the whole block selection and takes one undo entry. And it *expands*: the far edge stays put. An effect that could shrink on this key would make the two arrows a second pair of nudges, which is what the plain arrows already are.
- **Ctrl+. / Ctrl+/** — mark a spot and return to it.
- **Ctrl+Shift+0-9** — jump a tenth of the way through. The digit *is* the tenth, so 3 is three tenths in however long the song is. It doesn't collide with the bare digits that divide the timing, and there's a test for exactly that.
- **Ctrl+A** — select every effect. "Select All effects but no timing tracks", which is what it selects anyway: a timing mark isn't an effect and can't be in a block.

### Recorded rather than guessed

**Ctrl+L / Ctrl+U lock and unlock an effect.** We have no notion of a locked effect, and inventing what locking prevents — moving? editing? deleting? — would be exactly the Alt-drag mistake again.

Also missing: Ctrl+0-9 jump to a timeline tag (needs tags we don't have), F5 Effect Update, Alt+1..4 tool icon size (our palette is text), and the Ctrl+F1..F12 window toggles, which our panels could take but which are a set worth doing together.

## A Custom value curve can repeat

Two more sequencer pages read. The views page found nothing missing — creating, deleting, adding and removing models, reordering with the arrows, and per-row visibility are all there.

The value-curves page found one thing:

> "A Custom curve has a Cycles control (1 to 10) that repeats the shape you have drawn across the effect."

Ours had cycles for every periodic type and not for Custom, which made a hand-drawn shape usable only as a single slow sweep. The drawn shape is now a **period** rather than the whole span, so a hand-drawn flicker works on a four-second effect.

### The bug my own change introduced, and the rule that fixed it

Adding Custom to the periodic set broke an existing test immediately: a custom curve read **0 at the very end of the effect** instead of holding its last point.

The cycle position is the fractional part of `x * cycles`, so at exactly 1.0 it returns 0 — the start of the next cycle. That's right when there *is* a next cycle and wrong when there isn't: a single-cycle curve should hold its last point past the end, and wrapping sends it back to its first.

So the wrap only applies when the curve actually repeats. A Custom curve at the default one cycle is byte-for-byte what it was before, which is the property the test now pins along with the repeating behaviour.

Worth noting the test caught this on the first run. The failure was a curve ending high reading as its starting value on the final frame of every effect using one — the kind of thing that looks like a rendering glitch rather than a curve bug.

### Still missing

**Saving a curve.** "Value curves can be loaded and exported as a .XVC file", loaded automatically from a `valuecurves` folder in the show. That's the library the Value Curves panel drags from, and it pairs with the Colour Dropper library already recorded.

## A timing track you can delete

Two sequencer pages read. The timing-tracks page turned up something small and obvious in hindsight: **a track could be created and never removed.**

Creating one is a single click — a fixed interval, a metronome and an onset detection each add a track — and there was no rename and no delete. A wrong guess at a BPM left a track in the list forever.

- **Renaming keeps names unique.** That matters more than it looks: the label-driven effects — State, Piano, Guitar, Faces — name their track *by name*, so two tracks called the same thing would leave those effects reading whichever came first.
- **Deleting is undoable**, like every other body edit, which is what makes deleting a track of hand-placed marks survivable.

### Fixed and variable tracks

"Fixed Timing Tracks are not editable and the timing marks cannot be changed... right click and select Make Timing Track Variable."

What it protects is an imported lyric track. Its marks line up with words somebody synced, and one stray click on the ruler adds a mark that puts every phrase after it out by one — silently, because the labels stay attached to their positions and simply belong to different marks afterwards.

Enforced in the store, where every mark edit passes through, rather than in the pure helpers. There's a test asserting the helpers *don't* enforce it, which sounds odd until you consider the alternative: if both checked, one of the two would eventually look redundant and get removed.

### What the two pages leave open

Timing tracks: exporting a track (`.xtiming`, or PGO for other sequencers), Import Notes onto an existing track, and the Find/Replace and lyric-lookup tools.

Effect presets: the page says a preset can "span layers and models". Ours store a single effect. Everything needed now exists — block selection, and a clipboard that already stores a block as relative offsets and rows, which is exactly the shape a spanning preset wants. It's recorded rather than built because it changes the stored format, and preset files written by the old shape have to keep working.

## The Guitar effect

The unaudited-pages list named five effect pages for effects we might not have. Checking the registry first, rather than assuming: **Adjust** and **Kaleidoscope** were already there. Of the three that weren't, one was immediately buildable.

> "The Guitar effect turns MIDI note data into an animated stringed-instrument visualization. Using note data from a MIDI timing track it lights up strings and fret positions in time with the music, and can be styled as a guitar, bass guitar, banjo or violin."

The hard part already existed. A MIDI file imports as a timing track whose labels are the keys sounding, and the Piano effect already reads exactly that — this is the same data seen from a different instrument, where a note is a position along a string rather than a key.

### The decision that makes it readable

A note is placed on the **highest** string that can reach it, which is how it's actually fingered: a guitarist plays middle C on the B string at the first fret, not on the low E at the eighth, because that's where the hand already is.

Picking the lowest string instead — the obvious implementation, since you find it first — would send a melody sliding *down* the neck as it rose in pitch. Wrong, and unreadable as a visualisation.

Standard tunings for all four instruments, including the banjo's short fifth string and the violin's fifths. A note the instrument can't reach, or one past the last drawn fret, is dropped rather than rendered at a fret that isn't there.

Sparkles taught the same lesson two changes back, and it applies here: the wave animation runs off the note's own progress through its timing cell, not off a remembered phase, so a frame renders identically scrubbed and exported. There's a test for exactly that.

### The other two

**Duplicate** — "copy effect data from another model", per layer, with four switches deciding whether this effect's palette, colour settings, blending and layer settings override the source's. Every piece it needs now exists, layers and strands included. What makes it its own slice is that it reads *another row's effects at render time*, which nothing else in the engine does.

**Moving Head** — DMX fixture control, a stated non-goal alongside the DMX and Servo effects.

## Selecting effects by what they are, not where they sit

Two things: a sweep that found nothing, and a panel that came out of reading.

### The sweep

Three changes have now turned up a setting describing something the app couldn't produce — Layer Blending with no second layer to blend, the Mix slider with nothing to mix, and the Media/Animated sequence type with no way to create an animated sequence. Each was found by accident while building something adjacent, which is not a mechanism.

So: a deliberate pass asking "what produces the data this reads?" of every layer setting, every effect in the schema registry, and the four candidates most likely to be orphaned. Every layer setting has a control. Every effect the engine dispatches has a schema, and every schema'd effect is in the palette — no orphans in either direction. Faces, states, sub-models and controller assignments all have editors.

**It found nothing**, which is worth saying plainly rather than quietly moving on. The pattern was real three times and appears to be exhausted.

### Select Effect

`windows.md` turned out to be a pointer — "the Windows are described in the View, Windows section" — and the child page lists fifteen panels. Reading it via the sitemap is the habit that has now paid off three times.

Most are present. One was worth building immediately: **"allows the user to select effects based on type, model, and time" for bulk editing.**

Block selection can already draw a box, and once effects are selected they can be aligned, recoloured together, copied as a block or deleted at once. What a box can't do is reach what a *criterion* describes: every Fire in the show, everything on the mega tree, everything in the chorus. Those are the selections a bulk edit is actually for, and a box only finds them when they happen to be adjacent on screen.

- **Criteria combine with AND**, because that is the only combination anyone can hold in their head. "Fire, on the tree, in the chorus" reads as one sentence; a mixture of ANDs and ORs would need explaining in the panel itself.
- **Time is the marked play range**, not two typed numbers. The range is already the highlighted region on screen, so there is nothing to type and nothing to get subtly wrong.
- **Overlap, not containment.** An effect running through the chorus is part of the chorus; requiring it to start and end inside would miss the long pad that is usually the thing you were after.
- **The panel says what it will select, in a sentence.** The risk here is selecting more than you meant and then aligning or recolouring it in one go — "every effect, on every row, in the whole sequence" gives someone pause where three half-filled fields don't.

The other panels are recorded: the Value Curves and Colour Dropper libraries we have editors for but no saved library to drag from, the Effect Assist coordinate panel that our Pixel and Sketch editors cover for the two effects needing it most, and the Jukebox, which is the preset library without the live-performance half.

## A sequence with no soundtrack

Building "Default Sequence Duration and FPS" — a small preference recorded three changes ago — turned up that the preference had nothing to be a default *for*.

**An animated sequence could not be created at all.** The Media/Animated type has existed since Sequence Settings landed, and every path to a new sequence went through picking an audio file. "Animated" was reachable only by creating a sequence with a track and then telling it it didn't have one.

That's the third time this shape has appeared: a setting that describes something the app can't produce. Layer Blending had no second layer to blend, the Mix slider had nothing to mix, and now a sequence type had no way to be born.

So there's a create path with no audio, and *that* is what the duration default is for. A sequence with a track takes its length from the track — the right answer, and not worth a preference to override.

Alongside it: **Default Model Blending for New Sequences**, and the FPS half of the duration setting. The frame-rate preference is restricted to the values the API accepts, because a preference that produced a sequence the server refuses would fail at create time with a validation error rather than anything a person could act on.

### Still missing, and why

**Default View For New Sequences.** Views are a per-layout list here and nothing on a sequence points at one, so there's no field for a default to fill. Recorded rather than approximated.

## The screen's copy of the compose rules is testable now

Four things can address the same node, and the order they're applied in *is* the feature: the group first, then the model's own rows, then strands, then sub-models.

Those rules exist **twice** — once for the live preview and once for the `.fseq` export. The export's copy has been tested since the export tests landed. The preview's copy lived inline in a Vue component, and nothing in this suite mounts one, so it had never been observed at all.

Two implementations of one rule, one of them unobserved, is the exact shape of the failure this codebase guards hardest against: a show that looks right on screen and plays wrong in the yard, discovered when it's dark outside.

### Why it took a refactor rather than a test

The composition was tangled with canvas work and component props, so there was nothing to call. It's now a pure function the component invokes, taking **rendering as a callback**. That's the part that makes it testable without an engine, a canvas or a clock — what's being asserted isn't what an effect looks like, it's which of four sources wins on a given node.

Eight tests: the group showing through where the model is silent, the model over the group, a strand over the model, a sub-model over a strand, and the writeback rule that makes the ordering safe — **a borrowed set of lights writes back only where it actually drew**, because a transparent pixel means "nothing to say here", not "turn this off". Plus the blending toggle, and two degenerate cases that should not blank a model: a strand that rendered nothing, and a sub-model whose spec selects nodes the model doesn't have.

### On carrying an item four times

This was on the list for four passes, described each time as worth doing "when a cheap way appears". It wasn't going to appear — it needed a refactor, and calling it a test-only change was what kept it looking postponable.

That's the same failure the unaudited-pages list was built to prevent, in a different costume: work that stays invisible stays undone.

## Retention reaches the other history, and the last Settings tab

### A correction to the last change

The previous change added snapshot retention and I said the same unbounded growth applied to layout snapshots. **That was too strong.** Layout snapshots have always pruned their *automatic* ones by count — only the manual ones, taken deliberately before a big change, grew without limit.

But there was a real problem underneath the overstatement, and a worse-shaped one: the retention preference said "keep snapshots for N days" and reached **sequence history only**. A setting that silently governs one of two things is worse than a setting that governs neither, because it reads as though it worked.

So layouts get the same time-based purge, driven by the same preference, with the same rule that the most recent snapshot survives whatever its age.

### Settings > Services, and the end of that group

The last unread Settings tab configures xLights' own AI integrations: an API key for a hosted model, a base URL for an OpenAI-compatible endpoint, model and image-model pickers, per-feature enables for Colour Palette, Images and Mapping.

Marked 🚫, and worth being precise about why: this isn't a settings gap, it's a *feature* gap wearing a settings tab. If those features are ever wanted here they're their own project, and the configuration would follow them rather than lead.

**All six Settings tabs are now audited.** The blanket note that dismissed them as "machinery this app doesn't have" was wrong about half of them — Colors, Effects Grid, Sequences, View, Other and Backup all held applicable behaviour, two of them whole tabs' worth, and one named a choice the app was already making silently.

## Snapshots were kept forever

Reading Settings > Backup for its "Purge Backups Older Than" setting turned up something bigger than the setting: **nothing purged snapshot history at all.** Not in the app, not in the API — there was no delete endpoint for a version and no retention rule anywhere.

Autosave drives snapshots, so a season's editing accumulates a full copy of the sequence body every few minutes, forever. Retention simply had no expression.

The manual's own windows are offered — Never, 365, 90, 31, 7 — with three decisions around them:

- **Forever is the default.** Deleting someone's history is not a thing to start doing because a setting was added, and the whole value of a backup is that it's there when it finally matters.
- **The most recent snapshot is always kept, whatever its age.** A retention rule that can empty the history turns "keep less" into "keep nothing", and a backup has to survive not being used for a while.
- **Purging runs when a snapshot is taken**, which is the only moment the history grows and so the only moment retention needs deciding. A purge that fails is swallowed: it leaves *more* history than asked for, which is the safe direction and not worth interrupting an edit over.

The API gained a purge endpoint and a single-version delete — the manual half of the same job — both editor-only, with a test that a viewer can do neither.

## Output, read rather than assumed

Settings > Output is genuinely all live-output machinery: ArtNET and E1.31 frame sync, forcing a local IP, duplicate-frame suppression to cut network traffic, the xFade/xSchedule instance picker. Marked 🚫.

That is what the previous blanket dismissal of these tabs *claimed* about all of them, and it was right about this one and wrong about three others. The difference is that this row was written after reading the page.

## Three Settings tabs that were dismissed unread

The coverage doc contained a note saying xLights' remaining Settings tabs "configure machinery this app doesn't have". That judgement had been made without reading them — and it was wrong on all three read here.

### Timeline Zooming, which we were already deciding silently

> "Zoom in on the Sequencer Timeline based on the Play Marker (Green Triangle with Red Line) or the Mouse Cursor Location."

The zoom anchoring built a few changes ago holds the moment under the *cursor* still, falling back to the playhead when there's no pointer. That was a design decision made on its merits — and it turns out to be one of two options xLights offers as a setting. It's a setting here now, defaulting to the cursor: a zoom made with the mouse is aimed at something, and holding the playhead instead moves the thing being pointed at out from under the pointer.

### Exclude Presets when packaging

> "If selected, when a sequence is packaged with the Package Sequence option, all effects presets are stripped."

Worth having for a reason the manual doesn't give: a package is usually made to hand to someone else, and presets are the personal part of a show — the sequences and the layout are what the other person wants.

Its companion, **Exclude Audio**, needs nothing. This package has never carried audio and says so in its own row.

### What the three tabs turned up that isn't built

- **Sequences**: default duration, FPS, model blending and view for *new* sequences — four defaults for a dialog we already have. Plus **Low Definition Render**, "models like matrixes and trees can be set to render at a smaller resolution to help lower render times", which is a real technique we don't have.
- **View**: play controls on the house preview, auto-showing it during playback, hiding the preset preview.
- **Other**: video codec and bitrate for the house-preview video export.

The rest is genuinely inapplicable and now says why rather than being waved off: render caching and Save-FSEQ-on-save describe a persistent rendered copy that can fall out of date, where this renders on demand; FSEQ and media directories are filesystem paths a browser has no equivalent for; crash-report email and controller ping intervals are desktop machinery.

### A correction

The View tab names an **Effect Assist Window** — Always On, Always Off, Auto Toggle. An earlier row said the manual describes no Effect Assist panel. That was true of the *Changing An Effect* page and wrong about the manual, which is the same mistake made once before with the palette Update button, and the same lesson: "the manual describes no such thing" is a claim about one page.

It exists, we don't have it, and it's a gap rather than an absence.

## The audit stops relying on luck

Reading `layers/layer-settings.md` — a child of the page that produced the largest finding of this run — turned up a section with **no row in the inventory at all**: Roto-Zoom. Rotation, zoom and a pivot point are implemented and have been for a while. The page also names a Rotation Preset and a Zoom Preset dropdown, a Zoom quality control, and an Application Order setting, none of which we have.

Those three are named without being defined. The page gives no preset list, no quality scale, and no explanation of what order is being applied to what — so they're recorded rather than guessed at, the same call as Alt-drag stretching. The **Camera dropdown** for the Per Preview render style is a different case: a real gap rather than an under-specified one, since it picks which preview camera a Per Preview buffer is seen from.

One control is marked 🚫. "Reset panel when changing effects" exists because xLights' Layer Settings panel is *sticky* — it keeps the settings you last used and applies them to the next effect you select, so it needs a way to say "don't". Our panel reads the selected effect's own settings, so there's nothing to reset and a checkbox for it would control nothing.

### The part that matters more than the row

That's now **three whole sections found missing from the inventory rather than marked incomplete in it** — Settings > Colors, Settings > Effects Grid, and now Roto-Zoom. Every one was found by reading a page and noticing no row existed for it.

That's luck dressed up as method. A section nobody happens to read about stays missing forever, and "twelve findings in twelve passes" is not reassuring when the finding mechanism can't see what it hasn't looked at.

So the coverage doc now ends with the manual's own page list, filtered to the pages no row corresponds to. Six unread Settings tabs, most of the Layout tab's pages, nine sequencer pages, Lua scripting, the keyboard-shortcuts appendix (distinct from the sequencer's shortcuts page), and five effect pages for effects we may not have at all.

It also records a judgement that should be revisited: an earlier note dismissed the remaining Settings tabs as "machinery this app doesn't have" — a call made *without reading them*, which is exactly how Colors and Effects Grid were missed.

The remaining audit is now enumerable instead of discovered.

## What ends up in the file

Three changes in a row landed on the `.fseq` export path — the layer cap and its drop order, the layer *ordering* that decides which effect wins, and strand rows — and that path had **no test at the web level at all**.

Each of those is a case where the export and the live preview are separate implementations of the same rule. That's the failure this codebase guards hardest against, because a show that looks right on screen and plays wrong in the yard isn't discovered until it's dark outside.

So: four tests that read the actual bytes back out of an exported file.

- **A model row lights every one of its channels.** The baseline, and the thing every other assertion is measured against.
- **A strand row lights that strand and nothing else** — the property that makes strand rows safe to render: no light belongs to two strands and none is left out.
- **A strand sits on top of the model's own effects**, per "the strands blend onto the model level effects". Checked node by node: the strand's colour on its own nodes, the model's colour everywhere else.
- **The higher layer wins in the file**, whatever order the effects are stored in. The scrubbing path was fixed to composite by layer rather than by array position; this is the same rule holding in a separate implementation of it.

None of these can pass vacuously — each asserts a specific channel is *lit*, so an export that produced nothing would fail rather than quietly agree.

## Strand rows

The geometry landed last time; this is the half that makes it reachable. Expanding a model in the sequencer now shows its strands — "click on the Model name in the sequencer to display the Strand names" — and each strand takes effects of its own.

The layer menu needed no strand-specific code at all. It hangs off row labels, so "then right click on the strand name and choose Add Layer above or below the selected strand" works the moment strand rows exist. That's the payoff for having built layers as a property of effects rather than as a container: a strand row is just another row, and layers came along for free.

### Precedence, and why both render paths care

"The strands blend onto the model level effects." So a strand sits on top of the model's own rows — and a sub-model on top of *that*, being the thing somebody drew deliberately rather than a fact about the wiring.

Both render paths compose them in that order: the live preview and the `.fseq` export. That agreement is the thing this codebase guards hardest, because the failure it prevents is a show that looks right on screen and plays wrong in the yard, which nobody discovers until it's dark outside.

### Two smaller decisions

- **Strands are offered only when a model has more than one.** A single-run prop's strand row would be identical to its model row — a row that does nothing but take space.
- **The row kinds are one named type now**, rather than the union `"model" | "group" | "submodel"` repeated in nine places. Adding this fourth kind should have been one edit and was nine; the last time a rule was spread across a file like that, a gesture went missing and no test could see it.

## Strands, derived from the wiring

"To add layers at the strand level, click on the Model name in the sequencer to display the Strand names. Then right click on the strand name and choose Add Layer above or below the selected strand."

Which needed a question answered before any of it could be built: what *is* a strand here? It is one string of a multi-string prop — the physical run of lights — and it is not a sub-model. A sub-model is something a person drew; a strand is a fact about how the prop is wired.

The good news on reading the geometry: every node already knows its `string` and its `indexInString`. So a strand needs no new geometry code at all. It is expressible as a node-range sub-model, which means it resolves through the path sub-models already use — including the `parentIndices` writeback that lets anything rendered on a borrowed set of lights actually reach the yard.

- **Derived, never stored.** Strands are a fact about the wiring. A stored copy would go stale the moment someone changed a model's string count, and the symptom would be effects rendering onto lights that had moved.
- **Nodes in run order**, not the parent's array order. A strand is what a chase travels along, and a strand whose nodes came out shuffled would render a chase as noise.
- **Ranges are compressed** into the same notation the sub-model editor reads and writes, so a strand is expressible in exactly the terms a hand-written sub-model is — and anyone who wants to start from one can copy it. A 500-node strand would otherwise be a paragraph.
- The property that makes strand rows safe to render, and the test that pins it: **the strands cover every node exactly once.** No light belongs to two strands and none is left out, so strand rows can't double-light or silently drop part of a prop.

### What's deliberately not here

The sequencer rows. Expanding a model into its strands needs a new row kind threaded through the store, the grid, the `.fseq` export and the package format — and a half-built row kind is worse than none, which is the same call made when block selection was named as a prerequisite and built on its own afterwards.

The geometry half is done and tested, so the row work has nothing left to discover.

## Layers survive an import

Adding a field to an effect means checking every path that carries an effect somewhere else. Two of the three needed work, and both would have failed silently.

### The importer was already reading layers, then throwing them away

The `.xsq` parser walks `<EffectLayer>` elements to find the effects — it always has — and then flattened them, reporting one list with no record of which layer anything came from.

Until layers had an interface that was the best the app could represent. Now it's data loss, and the worst kind: a flattened import still renders. Every layer's effects end up stacked at the same instant, blending in file order, producing *something* that isn't what the author wrote. Document order is read as bottom-to-top, which is the order this engine composites in, so the index carries straight through.

### Presets were about to carry a layer as if it were a setting

A preset is built by cloning the effect and deleting the parts that aren't settings — id, start, end. `layerIndex` would have ridden along, so applying "warm twinkle" would have moved the effect to whichever layer the preset was saved from.

A layer is a **position**, like the times. It says nothing about how an effect looks. The guard test is written as a record of the positional fields rather than a list of assertions, so a new one has to be excluded here too or the test stops compiling.

### Package Show needed nothing

It stores each sequence body whole rather than field by field, so the new field rides along. Worth checking rather than assuming, and worth stating so the next person doesn't check it again.

## Effect layers get an interface

The last change found that layers were the biggest single gap in the app, and left it named in two coverage rows. This builds it.

The engine has blended simultaneous effects on a row since the beginning. What that meant, once the *Layers* page was read against it, is that **Layer Blending and the Mix slider had been implemented, correct and unreachable** for as long as they had existed — the grid refuses to place one effect on top of another, so nothing could author a second layer for them to act on.

### A layer is a number on the effect

Not a row of its own. Layers are a property of the effects, not a container holding them: an effect moved between layers is the same effect, and an empty layer is a row to draw rather than a thing to store. It also means every sequence written before this reads as a single-layer one, which is what it is.

The composite order is now the **layer** order in both render paths, rather than wherever the effects happen to sit in the row's array. "Each layer can be blended with the layer below it", so which one is below has to be the layer number.

### The gestures

Right-click a row label to show its layers, then **Add Layer Above**, **Add Layer Below**, **Delete Layer**, **Collapse Layers** — per "right click the model in the sequencer tab and choose Add Layer above or below (the current layer)".

- **Layers draw highest-first**, because the grid runs top-down while the stack composites bottom-up. The layer nearest the viewer belongs at the top of the list, the way it is in every other editor.
- **Delete Layer says what it will take with it** — "Delete Layer (and 3 effects)". Deleting a layer that still has effects on it silently would lose work.
- **Collapse is a display change only.** "Collapses the expanded effect layers back down to a single row" — the effects stay on the layers they were on.
- **Effects land on the layer they were dropped on**, whether placed, dragged from the palette, or picked from the radial wheel. And dragging an effect between two layer rows changes its layer, since the row is the same row.
- Adding a layer, deleting one, or renumbering everything above one is a **single undo entry**. Undoing an "add layer" one effect at a time would leave the row in a state nobody asked for.

A collapsed row still shows every layer at once and places onto the bottom one, which is exactly what every row did before this existed.

### Two rows I owed from last time

`rendering.md` and `render-all.md` were read during the previous pass and never got coverage rows, because the layers finding took the slice over. They have them now. Rendering describes the render buffer per model/group/submodel, which is this engine's model exactly. **Render All is marked 🚫 rather than missing**: xLights keeps a rendered copy of the sequence that can fall out of date with the effects that produced it, where this renders on demand from the effects themselves. There is nothing to force, and a button that re-did what is already current would be a button that does nothing.

## 200 layers, not 5 — and the bug that was hiding behind the number

The *Layers* page: **"Each model may have a up to 200 layers of effects."** Our cap was 5, a number from the original milestone's scope that had never been checked against the manual. Five is low enough to be reached by an imported sequence, not only by someone being unreasonable.

Raising it turned up a real bug that the low cap had been keeping quiet.

### Over the cap, the wrong end was being dropped

The renderer kept the **last** N active layers. The last N is the *top* of the stack — so a row over the limit discarded the base that everything else blends onto, and rendered as if its background had never been drawn. It now drops from the top instead, which at least leaves the picture recognisable.

Both render paths do the same thing. That matters more here than the fix itself: scrubbing and the sequential export sweep are separate code paths in this engine, and a file that doesn't match the preview is the worst kind of bug it can have — it only shows up when the show is running. There's now a test rendering the same over-cap row through both and asserting they agree.

### The bigger half is still missing, and two rows now say so

Simultaneous effects on a row **are** the layers, and the engine blends them correctly. But the grid prevents overlapping effects, so the only way to get a second layer into a sequence is to import one. The manual's own gestures don't exist here: "right click the model in the sequencer tab and choose Add Layer above or below", the same at strand level, and "Collapse Layers" to fold them back to a single row.

Which has a consequence worth stating plainly rather than leaving implied: **Layer Blending and the Mix slider are both implemented, correct, and unreachable.** They work on rows with two or more layers, and nothing in the interface can create one.

The Mix slider's row has been downgraded from ✅ to ⚠️ for that reason. A control that works on data you cannot author is not the same as a control that works, and a tick beside it was the kind of note that stops anyone looking — which is exactly how the last eleven findings got missed in the first place.

## Sparkles, brightness and contrast — and a correction

The coverage row read **"Colour settings — palette — Up to 6 swatches"**. Both halves of that were short.

The manual's *Changing Color Settings* page: "Some support just one, some support up to 8." Six was wrong, and low enough to have been hit by anyone building a rainbow. The cap is now eight.

And the panel is not only swatches: "From the Color window, you can change the Colors that apply to the effect, as well as the **Sparkles, Brightness and Contrast** values", with the sparkle colour picked separately. Three controls that apply to every effect, none of which we had.

### Where they run, and why

Between the effect and the model, like the layer settings — they apply to every effect without any effect knowing about them. And *before* the transition, so a fade in fades what the sliders produced rather than the sliders brightening a partly-revealed frame back up.

**Sparkles are deterministic in (x, y, frame).** This is the rule the whole render engine turns on: an effect must render identically when scrubbed and when exported. A sparkle drawn from a random source, or one that remembered a seed between frames, would twinkle differently in the exported file than it did on screen — and nobody would find that out until the show was running. So it's a cheap integer hash of position and frame number, with a test asserting the same pixel on the same frame always answers the same, and another asserting the pattern doesn't fall into rows or columns (a weak hash lights whole lines, which reads as a grid rather than as sparkle).

They land on lit pixels only. A sparkle on an unlit pixel would light one the effect deliberately left dark, turning a chase into a field of static.

### A correction to the last change but one

Two changes ago I removed "multi-effect property editing" from the coverage row, on the grounds that it was our own idea rather than anything the manual asks for — having found nothing about it on the *Changing An Effect* page.

That was half wrong, and this page is where it says so: "The 'Update' button will apply the current colors palettes to all the selected effects."

So applying a **palette** across a selection is real parity, and it's now built — offered whenever more than one effect is selected. Applying an effect's own **parameters** across a block remains our idea and remains a bad one: a Fire's settings mean nothing to a Bars, which is presumably exactly why the manual offers this for colours and nothing else.

The lesson is narrower than "read more". A feature absent from the page you'd expect it on can still be documented one page down, so "the manual describes no such thing" is a claim about one page, not about the manual.

## Sequence Settings, and a sequence you can change after making it

Back to reading fresh manual pages, choosing rows that looked *settled* rather than rows already marked incomplete — that is where every finding in this run has come from. The row for **New sequence, sequence settings** read `✅` with an empty note, and the emptiness was the tell.

There was no way to change a sequence at all after creating it. Not its name, not its length, not its frame rate. The API had create, save-body, and upload-audio, and nothing else. You picked a duration in the new-sequence dialog and lived with it.

### The Info/Media tab

Name, **Sequence Type** ("Media or Animated"), duration, timing, and **Allow Blending Between Models**.

That last one turned out to name behaviour the renderer already had half of. The manual: "decides whether effects from the model groups blend with model level effects". What we did was the *off* case — a model's own effects replace the group wherever they draw at all, and the group shows through only where the model has nothing to say. On, they composite over it, so a half-lit model lets half the group through.

Off stays the default, because it's the more predictable of the two: what you put on the model is what you see.

### The Metadata tab, whole

Author, email, website, song, artist, album, music URL, comment. One column rather than eight, because nothing queries them — they travel with the sequence and are read back whole.

### Saved apart from the body

The body autosaves on every drag of every effect and carries an optimistic-locking etag. These are deliberate changes made in a dialog. Sharing an endpoint would mean every autosave had to resend the settings, and a stale copy would then quietly overwrite someone else's change to them. Keeping them off the undo stack matters for the same reason in reverse: Ctrl+Z after an hour's work should not be able to change the frame rate.

### What the page has that we still don't

- **Timings tab** — its VAMP plugins. The rest of the tab (generating and importing timing marks) is the Timing panel here.
- **Data Layers** — importing another sequencer's rendered output as a layer, with Erase/Canvas render modes and layer precedence.
- **Images** — managing the images embedded for effects like Pictures.

## Copy and paste a block, and a guard for the gesture that vanished

Two things, one of which exists because of a mistake in the last change but one.

### A clipboard that holds a block

Block selection made the alignment commands possible. This is the other thing it makes possible, and the more useful of the two day to day: copying eight effects across three props and dropping them on the second chorus is the bulk edit a sequencer exists for, and it was still one effect at a time.

The clipboard holds **relative** positions — how far apart the effects are, and which rows they sit on relative to the topmost — so a block can land anywhere and on any prop. Absolute times would only ever paste back where they came from.

- **It anchors on the earliest effect**, not the reference. Anchoring on the reference would make pasting jump backwards whenever the reference wasn't the first effect selected.
- **A paste is one undo entry**, and the pasted effects become the new selection, which is what lets you paste and then immediately drag or align the thing you just pasted.
- **A block pasted lower than it fits piles onto the last row** rather than half-vanishing. Silently dropping the overflow looks like the paste having partly failed; effects piled on the last row can at least be seen and moved.

Cut, duplicate and the keyboard commands follow the same rules.

### The guard the regression needed

The last change fixed a gesture that had stopped existing: shift on an effect's edge authors a fade, shift on its body picks the alignment reference, and adding the second put an early return in front of the first. Nothing failed and nothing warned. It was found by re-reading the handler, which is not a repeatable way to find things.

The decision is now a function — what a press means, given where it landed and which modifiers are down — and the gestures are a **closed set**. One test enumerates them and asserts every one is still reachable from some press. A gesture nothing can produce is a feature that has silently stopped existing, and that is now a failing test rather than something to notice by accident.

The ordering inside it is the fix, stated once where it can be read: the edge test comes before the shift test, because a rule that checks shift first can only ever express one of the two shift gestures.

### A correction

Multi-effect **property editing** has been sitting in the coverage row as a missing feature. Re-reading, it was our own idea rather than anything the manual asks for — the page describes no such thing. Applying every parameter to a block of differently-typed effects is wrong more often than right (a Fire's settings mean nothing to a Bars), so the row now says it needs deciding on its merits rather than implying parity work left undone.

## The ghost outline, and a drag that is a proposal

"While you drag, a 'ghost' outline follows the cursor to show where the effect (or effects) will land when you release the mouse button." And: "when dragging several effects at once, only the ghost outlines that would collide with an existing effect turn red, so you can see exactly which effects are blocked while the rest are free to drop."

The second sentence is why this needed the drag rewritten rather than a rectangle drawn over the old one. Our drag committed on **every pointermove** — which is why it needed a snapshot taken at drag start and carefully *not* taken again per move, and why there was nothing to draw a ghost *of*: the effect was already there.

A drag is now a proposal until the mouse is released. That falls out into several things at once:

- **The ghosts show where the block will land**, in time and across rows.
- **Colliding ghosts turn red**, and on release the free ones drop while the blocked ones stay where they were. Refusing the whole drag because one of twelve effects overlapped would make block dragging useless on exactly the busy row where you want it.
- **One drag is one undo entry**, including a drag that changed both the time and the row.
- The live-mutation-per-move pattern, and the snapshot guard that existed only to survive it, are gone.

**The block stays rigid.** The delta is clamped for the block as a whole rather than per effect: clamping each one separately would let the effect that reaches the start of the sequence stop while the rest kept going, quietly changing the spacing between them.

### A regression fixed on the way

Adding reference-picking in the last change put `if (e.shiftKey) return` at the top of the effect branch — which made the shift-drag fade gesture from the change before it **unreachable**. Both gestures use shift on an effect, and they're told apart by whether the pointer is on an edge, so the early return now only applies to the body of an effect. Found by re-reading the pointerdown path while refactoring it, not by a test — the two gestures were added in consecutive changes and nothing tied them together.

## Block selection, and the alignment commands it unblocks

The last audit found that three recorded gaps — the align commands, Alt-drag stretching, and the ghost outline — were one gap wearing three hats. All of them need **selecting a block of cells across rows**, which this app had no notion of. This builds it, and then the alignment commands that were the clearest thing waiting on it.

### Selecting a block

Drag a box over empty grid and it selects every effect it touches, across rows. Then, per the manual, "hold down shift and click the effect you want to be the reference".

- **Touching, not enclosing.** Dragging a band across the middle of a row of effects is how you select that row. Requiring the box to contain each effect whole would mean carefully starting before the first and ending after the last.
- **A drag draws a box; a click still seeks.** Which one it was is decided on release, because it isn't known until the pointer either moves or doesn't — and seeking on the way into a box drag would drag the playhead along with the box.
- **The reference is drawn differently** from the rest of the block: white outline versus a dimmer one. An alignment moves everything onto the reference, so which effect that is has to be visible before you pick the command, not after it has moved eleven effects.
- **A single selection is a block of one.** There is one notion of "selected" rather than two that can drift into disagreeing about which effect the props panel is editing.

### Aligning

Four commands on the right-click menu — start times, end times, both, and centrepoints — offered only when there's actually a block to align, since four entries that would each move nothing are worse than four entries that aren't there.

Three of them keep each effect's own length and only move it. **Both** is the one that changes durations, which is exactly why it's a separate option rather than being what "align" quietly means. Nothing is ever moved before zero: a start clamped at the front is a visible result, where a negative start is an effect off the left of the grid with nothing left to grab. The whole alignment is one undo entry — undoing it one effect at a time would be worse than not having the command.

Delete now takes the block too, from the keyboard and from the menu. A selection you can see but can't delete together is a selection that lies about what it is.

### What's still missing, and why

- **Alt-drag stretching.** The manual says it produces "a Chase effect" and never defines the stagger. It stays unbuilt rather than guessed at.
- **The ghost outline.** Its collision colouring is described for dragging several effects at once, and our drag still commits live on every pointermove — it needs to become preview-then-commit first.
- **Multi-effect copy, duplicate and property editing.** These still act on the reference alone: the clipboard holds one effect and the props panel edits one. Stated in the row rather than left to be discovered.

## Shift-drag an effect edge to author a fade

From the *Changing An Effect* page: "Hold the Shift key and drag the left edge of an effect inwards to create a fade in, or drag the right edge inwards to create a fade out."

This is a gesture the app could already express and had no way to perform. The transition system has in and out durations, and the grid has drawn them as wedges since the Effects Grid tab landed — but the only way to set one was to type a number into the panel and look at the result. That is a poor way to answer "how long should this fade be", because the answer is "until it stops sounding abrupt", which you find by dragging.

The edge itself stays put during the gesture, which is what tells the two drags apart: a plain edge drag changes *when* the effect runs, the shift one changes *how it arrives*. The distance dragged inwards is the fade, and dragging back out to the edge removes it.

Four rules the gesture needed:

- **Unsnapped, deliberately.** A fade is a length by ear, not a boundary. Snapping it to the nearest timing mark would quantise exactly the thing you are dragging to taste.
- **It adjusts the reveal already there.** Shift-dragging the edge of an effect someone gave a Circle Explode changes that transition's length rather than silently turning it into a fade. Only an effect with no transition at all gets one made for it.
- **A fade this gesture created is cleared when dragged back to nothing**, so an undone fade leaves no empty object behind to puzzle over in the panel. One that existed beforehand keeps its type at zero length — that setting was chosen deliberately and this gesture never touched it.
- **The two fades can't cross.** An in and an out that overlapped would ask the renderer to reveal and hide the same frames at once, and what that looks like is not something anyone chose.

## Three things that turn out to share one prerequisite

The same page describes the align commands, Alt-drag stretching, and the ghost outline drawn while dragging. All three were recorded as separate gaps. Reading them together, they are one gap:

- Aligning: "drag a box around all the effects you want to align and then hold down shift and click the effect you want to be the reference."
- The ghost outline's collision colouring is described for dragging *several* effects at once.
- Stretching produces "a Chase effect", which the page never defines — but its own chase recipe is "select a block of cells and hit 'd'... then drag the end line to adjust", so it is block-shaped too.

**Selecting a block of cells across rows** is the thing this app has no notion of, and building a one-effect imitation of each would look like parity while missing what all three are for. The coverage row now names the prerequisite instead of listing three symptoms of it. (The ghost outline needs a second thing besides: our drag commits live on every pointermove, where a preview has to be shown and then committed.)

## The waveform's zoom and scroll gestures

The *Timeline and Waveform* page lists five gestures for two operations. We had none of them — zoom was a dropdown and three levels wide.

- **Double-click the waveform** to zoom in; **shift+double-click** to zoom out.
- **Ctrl+wheel** to zoom. The manual describes it over an effect edge; it works over the waveform and the grid alike, since there's no reason for it to stop an inch higher up. Prevented from reaching the browser, which would otherwise zoom the whole page on the same gesture.
- **Right-click to reset the zoom.** The manual puts this on the timeline bar. We don't have one, and the grid's ruler right-click is already the timing-mark menu, so it lands on the waveform — a substitution the coverage row states rather than glosses over.
- **Shift+wheel** to move the waveform and grid sideways. It takes whichever wheel axis actually moved: a mouse reports the shift-modified scroll on deltaX on some platforms and deltaY on others, and a trackpad reports both.

### The ladder, and the anchor

Three levels topping out at 2x is nowhere near enough to place an effect against a 50ms frame in a four-minute song, and nothing below 0.5x showed you the whole thing. It's now seven steps from 0.25x to 16x, powers of two so a step is always the same visual jump.

The part that had to be right is the anchoring. Zoom that doesn't hold a point still throws you somewhere else in the song every time, which makes the gesture useless exactly when it matters — working on one bar. Zooming now keeps the moment under the pointer where it is; from the keyboard or the dropdown, where there's no pointer, it holds the playhead.

### Draggable play-range edges

The range added two changes ago could only be replaced, not adjusted — and adjusting one end is most of what you do with a range once it roughly covers the chorus. Its edges now drag. An edge takes precedence over the scrub, since the pointer is only ever on one when a range already exists. Each drag is built from the opposite edge through the same rule as a fresh mark, so dragging one end past the other flips the range rather than inverting it, and a drag that would collapse it leaves the old one alone instead of producing a range that loops without advancing.

### Still missing, and why

xLights' separate **timeline selection** — a second region, distinct from the waveform's, that plays *once* rather than looping. Play-once versus loop is the entire point of having both, and it needs a timeline bar this app doesn't have yet, so the row says so rather than treating the play range as covering it.

## A dropped effect fills the timing interval it lands in

The coverage row read `| Adding effects (drag, double-click, drop) | ✅ | |` — a tick with an empty note. Reading the *Adding An Effect* page against it turned up that we had the central rule backwards.

The manual: "Click on the effect from the effects toolbar and drag the effect to the grid and release it **between two timing marks** on the row of the model you wish the effect to play on." And then, separately: "If no timing track is selected then you can drag and drop even if you have no timing marks but the effect **defaults to 1 second long**."

The fixed length is the fallback. We only ever implemented the fallback — every dropped effect came out at the default length, so dropping one on a beat gave you something that then had to be dragged to fit the beat it was dropped on. Now a drop between two marks fills that interval.

Strictly between two marks: a drop before the first or after the last still gets the default length, rather than running to the end of the song. An effect that silently stretched across four minutes is a far worse surprise than one that came out a second long.

The radial wheel places the same way. It is the manual's other route to the same act — "click to drop it at that location" — and an effect placed from the wheel shouldn't come out a different length from one dragged to the same spot.

## The selected timing track

The manual's fallback sentence depends on something we had no notion of: a timing track being *selected*. Without it, "the marks" meant every track's merged together, so a show with a Beats track and a Lyrics track would have placed effects into the intersection of the two — finer than either and belonging to neither.

There is now a track selector in the toolbar. It decides where a dropped effect lands, what snapping snaps to, and which track a new mark, a split or a division goes on. **All tracks** is still there and still does what the app did before, which is the right setting for anyone who only ever has one.

Every track's marks are still *drawn* — hiding them would be a worse trade — but the ones in force get the full-strength line and the flag. An effect snapping to a mark that looks identical to one it ignores reads as the snapping being broken.

### A silent bug it turned up

The grid reported every mark under the pointer as belonging to track 0, whichever track it was actually on. Right-clicking a mark on a second track and choosing Delete Mark filtered track 0 for a millisecond it didn't have, and did nothing at all — no error, no deletion. Marks now report their own track.

## Dividing timings, and the Effects Grid settings tab

Two pages read against the app. The first was the *Dividing Timings* section of the shortcuts page, recorded as missing. The second was *File > Settings > Effects Grid* — a whole Settings tab we didn't have, which is the same thing that happened with the Colors tab two audits ago, found the same way and by nobody noticing until the page was read.

### Dividing timings

The manual gives this one sentence: "Keyboard shortcuts are available to divide the selected timing marks by predefined intervals, making it quick to build up subdivided timing tracks." It names neither the keys nor the intervals, so both are ours — **2**, **3** and **4**, on the number keys of the same name. Halving is the common case (a beat track becomes an eighth-note track), thirds are what a waltz or a triplet fill needs, and quarters save doing the halving twice.

"The selected timing marks" needed translating, because our ruler has no selection. But the waveform already has a highlighted region — the play range added last time — and it is exactly the "this bit, here" gesture this wants. So with a range marked, every interval inside it is divided at once; with nothing marked, the single interval the playhead sits in is, which is what `s` already does for two.

Two decisions inside it:

- **An interval too short to divide is skipped whole**, rather than divided as far as it will go. Asking for quarters and getting one mark somewhere in the middle is a worse answer than getting nothing, because it looks like it worked. The floor is the sequence's frame length: a mark between two frames can never be played against.
- **It says what it did.** Forty new marks and none at all are the same handful of pixels on a dense ruler at a low zoom, so dividing reports which it was instead of leaving you to count.

### The bug underneath it

A timing track's labels are positional — `labels[i]` belongs to `marks[i]` — which is how a Papagayo import arrives and what the State and Piano effects read. Inserting a mark sorted it into the marks and left the labels alone, so every label after the insert slid onto the wrong mark. Nothing reported it; the words simply came out a phrase late.

Subdividing a lyric track is exactly the operation that would have hit this, forty times in one keystroke. The bookkeeping is now a small pure module the store calls for every mark edit — insert, delete and label — so the three can't disagree about it.

### File > Settings > Effects Grid

- **Spacing** — Extra Small to Extra Large, which was a hardcoded 28px row height. xLights names the sizes without giving pixel counts, so the heights are ours; the smallest still fits the row label, the largest is roughly double it. Every place that turns a y coordinate into a row — drawing, hit testing, and the scroll spacer — reads the same number, or clicking a row would select the one above it.
- **Small Waveform** — half height. The waveform and the grid share the vertical space, and on a laptop the choice between seeing the beats and seeing the rows is a real one.
- **Display Transition Marks** — each effect's in and out reveals, drawn as wedges at its ends. On by default: an effect with a two-second fade in looks exactly like one without, which makes "why does this start dark" a question you can only answer by clicking it. A wedge rather than a line because the shape says which way it runs.
- **Double Click Mode** — "if you Double Click a timing mark, xLights will play the sequence for that timing mark interval. If 'Edit Text' is selected, the Edit Label Dialog will appear." Play Timing sets the play range to that interval, so it loops, which is what you want when checking a phrase against the music. Edit Text opens the label — which is also the label editor we didn't have anywhere outside an import.
- **Snap to Timing Marks** moved into this tab, where the manual has it.

Four of the tab's settings are deliberately absent, and the panel says so rather than leaving you to wonder: Icon Backgrounds and Node Values describe drawing this grid doesn't do, the render-completion bell belongs to a render that happens on a server rather than at your desk, and Hide Colour Update Warning hides a warning we don't show.

## A play range on the waveform

The coverage row for the timeline and waveform read "✅ — 3 zoom levels", which is the kind of note that stops anyone looking again. Reading the manual's *Timeline and Waveform* page against it turned up a page of behaviour, of which the most useful piece was missing entirely.

Shift-drag the waveform to mark a section, and it plays on its own — looping. The manual: "when it reaches the end of the area, will loop back to play from the beginning of that area."

The loop is the point. You work on one chorus by hearing it over and over, and a range you have to restart by hand is barely better than no range at all.

### Two rules that follow from "play means play *that*"

- **Pressing play jumps into the range** when the playhead is outside it, rather than ignoring the highlight and playing from wherever it happens to be.
- **It carries on from where it is when already inside**, because otherwise pausing mid-phrase and pressing play would always throw you back to the start of the range.

Both live in a small module with the loop rule rather than in the component, because two callers — starting play, and every time update — have to agree about them, and "where should the playhead be" is arithmetic that shouldn't need an audio element to check.

### Why shift-drag, not a plain drag

xLights marks the range with a plain drag on the waveform. Here a plain drag already **scrubs** — plays the track under the pointer, which is how you find a beat by ear. xLights' waveform doesn't do that at all, so its plain drag was free to mean "select".

Taking scrubbing away to match the gesture exactly would trade a better feature for a more familiar one. Shift is the modifier the manual already uses on the waveform, for zooming out.

The range shows in the toolbar with its own clear button: a range you can't see the edges of is a range you can't get rid of, and shift-dragging a new one over the top isn't obvious enough to be the only way out.

## Arrow keys move effects, not just the playhead

The coverage row for changing effects said "Move and resize; no align commands", which was true and hid something larger. Reading the manual's *Changing An Effect* page against it: "You can also select the effect and use the Left or Right arrow keys to move it left or right... an effect can also be moved vertically from one model to another. Use the Up or Down arrow keys."

Here the arrow keys moved the playhead and there was no keyboard way to move an effect at all.

### The jump rule is the feature

"When the effect encounters or is blocked by another effect, if you keep going, it will **jump over** the effect/effects and continue past."

That sentence is the whole reason this is worth having. The obvious implementation stops dead at a neighbour — which makes the keyboard useless exactly where it is most wanted, because a row packed with effects is where dragging with a mouse is hardest. Several effects packed together are jumped as a group, and it works backwards too.

Only a *blocked* step jumps. A step that lands short of a neighbour just lands there, which is what makes the arrow keys usable for nudging two effects flush together.

### What a vertical move does instead

A horizontal move can jump because there is somewhere to jump to. A vertical move onto an occupied slot has nowhere, so it is refused rather than left overlapping. The effect keeps its id when it changes rows, so it stays selected — a new id would deselect it mid-gesture.

### And when nothing is selected

The arrows go back to nudging the playhead, which is what they did before and what they should do most of the time. The fallback lives in the page rather than in the command registry, because the key is the same either way and only the page knows whether anything is selected.

## Backup on Save, and three shortcuts the manual has that we didn't

### Backup on Save

"If you have enabled Backup on Save, it will also take a snapshot after every Save operation." Layout snapshots already ran on a timer; this adds the other half.

**Off by default**, and that default is the whole design question. A save in xLights is a deliberate act; here every model drag saves immediately, so on-by-default would mean a snapshot every few seconds through an afternoon of arranging props.

It watches the layout rather than hooking each save, because there are a dozen paths that write to it — dragging a model, editing a state, importing a show — and hooking each is a dozen places to forget one. Debounced, and it reuses the same changed-since-last-snapshot check the timer uses, so dragging a model and putting it back doesn't add a duplicate.

### The shortcuts row said fifteen; the manual lists eighteen

Re-reading the shortcuts page against our table — the audit pass I'd queued — turned up three keys we didn't have and one feature behind them.

**`u` and `d`** are the On effect with its intensities swapped: fade up and fade down. They matter beyond themselves because they're the manual's example of a shortcut *carrying parameters* — "the On and Ramp Up/Down effects also enables the intensity to be defined as a shortcut key". The registry had no way to express that.

**`Shift+R`** generates a random effect. It draws from the effects that draw something on their own — a random canvas effect would land on a layer with nothing underneath and render nothing, which reads as the shortcut being broken rather than as a canvas effect behaving correctly.

**`s`** the manual gives to *both* Timing Split and Spirals, in the same table. A structural action beats an effect — splitting a timing mark can't be done any other way from the keyboard — so the split keeps it, and Spirals can be bound to any free key now that bindings are editable. Recorded rather than silently resolved.

### A knock-on the parameters caused

Three keys now place On, so a binding can't be stored against the effect's name any more: rebinding "fade up" would have moved all three. Bindings are stored against the shortcut's own identity instead, and the editor lists them as "On (fade up)" rather than three identical rows.

## Two effect rows finished

### Frame Waveform, properly this time

When the note-range types shipped, Frame Waveform went in as the frame's *level* drawn as a centred band — and the coverage doc said so rather than claiming it was done, because "displays the audio waveform only using the current frame of audio" means the wave, not a summary of it.

The analysis now keeps a sixteen-bucket min/max envelope per frame, and the effect draws that. The difference is asymmetry: a real wave sits above and below the centre line by different amounts, and that asymmetry is most of what makes it look like audio rather than a bar.

Sixteen buckets, not the samples. A frame at 44.1kHz is a couple of thousand samples; this is thirty-two numbers, which is more than a buffer a few dozen pixels wide can show. And a series without an envelope — analysed before this existed, or hand-built in a test — still falls back to the level rather than drawing nothing.

**Every VU Meter type in the manual is now implemented.**

### The Shape effect's last three settings

Random Location, Random movement and Fade Away, all listed on its page.

The randomness is **per shape and seeded**, not per frame. A shape that picked a new position every frame would be noise rather than motion — the point of "random location" is that six shapes are scattered instead of stacked, and they then move the way shapes move. A test pins that: the same moment rendered twice is identical.

Fade Away fades a shape across its own lifetime rather than the effect's, which is what stops a short lifetime looking like shapes blinking out of existence.

That leaves Emoji and system-font glyphs as the only things on Shape's page still absent, and those need a font this engine doesn't have.

## The layout had no history at all

Sequences have had version snapshots for a long time, and autosave on top of that. The *layout* — every model, its sub-models, states and faces, the groups, the view objects, the views and presets — had nothing. A mis-drag that moved forty props, or an import that read someone's show wrong, was unrecoverable.

xLights covers this in its periodic backup: "Every x minutes, the xlights\_rgbeffects.xml is backed up... **This includes the layout as well**."

So layouts now snapshot the way sequences do: automatically every few minutes when something has changed, on demand, and restorable. Deliberately the same shape as the sequence-version code rather than a second mechanism to learn.

### Restoring matches by name, not by id

This is the part that would have gone wrong quietly. A model's id is what every sequence body points at (`elementId`). Restoring by recreating models wholesale would give them fresh ids and leave every sequence in the project addressing rows that no longer exist — the layout would look restored and the sequences would be empty.

Matching by name keeps the ids for everything that existed when the snapshot was taken, which is exactly the case a restore is for. There's a test that asserts the id survives.

### A restore is not a merge

Models added since the snapshot are **removed**. That's the surprising half, so the confirmation says it in those words rather than "this can't be undone". A restore that kept them wouldn't be the layout that was snapshotted; it would be some third thing nobody asked for.

### Two things that keep the history useful

- **A snapshot is only taken when something changed**, which is what xLights does too ("if there have been any changes since the last auto save"). Leaving the page open overnight would otherwise fill the history with identical layouts and push the useful ones out.
- **Automatic snapshots are pruned to the last twenty; manual ones never are.** The periodic ones are a safety net and the deliberate ones are a decision, and the retention should follow that difference.

The list endpoint doesn't return the snapshots themselves, only their numbers and times — twenty layouts' worth of JSON is megabytes, and the list exists to choose one.

## Level Shape — and the shapes the Shape effect was missing

The VU Meter's last non-blocked type is "Level Shape": *"display the selected shape with a size that adjusts based on the audio level"*, from a list of ten shapes, filled or unfilled.

The Shape effect drew five of them. So this wasn't really a VU Meter job — it was a Shape job that two effects needed. Both now draw the manual's full geometric set: **Circle, Square, Triangle, Diamond, Star, Polygon, Heart, Tree, Candy Cane, Snow Flake, Crucifix, Present**.

One set of geometry, shared. A second copy would be two places for a candy cane to be defined, and they would drift.

### Why they were cheap to add

Every shape here is a *signed distance function* — how far a point is from the shape's edge, negative inside. That was already true of the five, and it is what makes Thickness mean one thing across all of them. Three things fall out of it for free:

- **Composite shapes are unions**, and a union of distance fields is simply the smaller of the two. A tree is a canopy over a trunk; a present is a box under a ribbon; a snowflake is three crossed spokes with branches.
- **Filled or unfilled is one comparison**, not a second drawing path: outline tests `|d| ≤ thickness`, filled tests `d ≤ thickness`.
- **Rotation rotates the sample point, not the shape**, so one implementation serves every shape and the distance functions stay axis-aligned.

The Shape effect also gains the **Points** and **Rotation** settings its manual page lists — Points is what makes Polygon a polygon rather than a fixed pentagon.

### A tree is three triangles

Worth saying because it's a judgement rather than geometry: one triangle over a trunk is technically a tree and reads as a triangle. Three stacked tiers read as a Christmas tree at the size a prop actually is, which is the whole point of the shape.

### What's left

Emoji and system-font glyphs, which need a font this engine doesn't have — a circle standing in for an emoji would be a worse answer than none. Shape's Random Location, Random movement and Fade Away. And the VU Meter's sample-accurate Frame Waveform.

## Re-audited the coverage doc, and found the shortcuts were a one-way street

The coverage doc is only worth what its last audit was worth, and a lot has changed since the last one. So: all 176 manual pages fetched again (88,653 words), every page title checked against the doc, and the doc's own counts checked against the code.

Three findings, one of them a real feature gap.

### Shortcuts could not be changed, and nothing said so

The manual, on the shortcuts page: *"These effects are stored in the xlights\_keybindings.xml file and can be modified by the user."*

This app had xLights' defaults and treated them as rules. Nothing in the coverage doc mentioned that they were only defaults — the row said "all fifteen of xLights' single-letter effect shortcuts" and stopped there, which is true and misses the point. Single-letter shortcuts are exactly the thing muscle memory owns, and someone who wants `z` for Fire had no way to say so.

Each effect's letter is now editable in Preferences, kept per-browser with the other preferences. A key that already places another effect is **refused, naming the clash** — two effects on one key means one of them silently stops working, and which one is an accident of registry order. Space, `t` and `s` stay reserved for the transport and timing keys, because shadowing those wouldn't fail, it would place an effect when someone meant to add a timing mark.

The effect wheel reads whatever is in force rather than the defaults. It exists so the wheel and the keyboard can't drift, and a wheel showing the letter that *used* to place an effect would be worse than a wheel showing none.

### A 🚫 row with no reason

**Tools > Lua scripting** was marked as a non-goal with an empty justification. Every other 🚫 explains itself; this one asserted. It now says what it would take — a Lua interpreter in the browser, and an API surface for scripts to drive, without which it is the feature in name only.

### An off-by-one in the effect count

The doc said xLights ships 55 effects. The manual's index has 56 pages under `effects/off/`. We render 47 of them.

## The backup was quietly losing half the show

Package Show has always exported a project as a zip and imported it back. Looking at it properly — the ⚠️ "no show-folder backup" row was the next thing on the list — it turned out the feature that existed was worse than the gap.

It carried models, groups and sequence bodies. It did **not** carry sub-models, states, faces, any controller, any channel assignment, view objects, sequencer views, or effect presets. Every one of those was added to the app *after* the package was written, and none of them announced themselves. A backup taken yesterday would have restored a show with its props in the right places, none of their sub-models, no singing faces, and nothing addressed to a controller.

That is the failure mode a backup has: you find out when you need it.

### What version 2 carries

Everything above, plus the layout backdrop. Controller assignments are carried **by name**, because a controller's id only means something in the project it came from — so they are re-linked after both sides exist, rather than restored as numbers pointing at nothing.

A version 1 package still imports. It simply has less in it, which is a true description of the show it came from as far as that code knew.

### Restoring now says what it restored

"Imported 4 sequence(s)" told you nothing about whether the thing you needed came back. It now lists models, sequences, groups, controllers, channel assignments, view objects, views and presets — and states, every time, that audio isn't in the file and needs re-picking. A restore is exactly the moment to say that, rather than leaving it to be discovered in the sequencer.

### The test that would have caught it

The interesting question is not "does the package carry faces" but "what happens the next time a field is added to a model". So the guard is a `Record<keyof ModelRecord, true>` — TypeScript refuses to compile it when a model gains a field, and the test then requires that field to be either packaged or *explicitly excluded with a reason*.

My first attempt at this checked the keys of a sample record instead, which would not have caught anything: the three fields that went missing are optional, and an optional field can simply be left out of a literal. Excluding a field is still allowed — id, channel_count, controller_id and controller_offset are all excluded — but now it takes a decision and a sentence rather than an oversight.

### One correction, after reading the manual's own Backup page

I wrote this up before reading that page, and got one thing wrong: the missing audio is not a shortfall against xLights. Its Backup copies "all the '\*xml' files from your show directory", and the manual separately advises backing up "media files that may have amended with audacity, GIF or JPEGs etc" yourself. The audio gap here is the same gap there.

What *is* genuinely missing is the automatic half — a timestamped `_onstart` folder at each launch, F10/F11 on demand, Backup on Save, and the periodic `.xbkp` snapshot every few minutes. This app autosaves and keeps per-sequence version snapshots, which covers a sequence but not the layout. And File > Restore Backup restores in place, where importing a package here creates a new project: safer, but not the same gesture.

### Also

The VU Meter's Start/End Note sliders showed a bare MIDI number. "48" is C3, and nobody reads it that way, so the note name now sits next to the number.

## VU Meter: the note-range types

The last substantial group of VU Meter types, and the one that needed something the analysis wasn't recording. 28 types to 37.

**Note On, Note Level Pulse, Note Level Bar, Node Level Jump, Node Level Jump 100** — plus the two **Dominant Frequency Colour** types, which read the same range — are given a *note* range rather than a band index. The manual: "Start and End Notes are used to set the frequency range."

A note is a frequency; a band is a range of frequencies. Turning one into the other needs to know where the analyser put its band edges, which is a function of the window size and the sample rate — and that was thrown away after analysis. The analysed series now records its band edges in hertz.

**A series that doesn't record them renders nothing** rather than falling back to the whole spectrum. The fallback would look like the effect working: a Note On pointed at a two-octave range would light up on a bass drum, and nothing about it would say why.

(The manual spells two of these "Node Level Jump" rather than "Note". Kept as written, so searching the manual for what you see in the picker finds it.)

### Frame Waveform, honestly

"Displays the audio waveform only using the current frame of audio." The analysis keeps a *level and a spectrum* per frame, not the samples, so this draws the frame's own level as a centred band. It is a real and distinct effect — it doesn't vary across the buffer the way the spectrum-driven Waveform does — but it isn't a sample-accurate waveform, and the coverage doc says so rather than counting it as done.

### What's left

**Level Shape**, which needs the Shape effect's shape set wired in, and the sample-accurate Frame Waveform above.

## VU Meter: 7 types to 28

The manual's VU Meter page lists about thirty-nine types. This app had seven.

The interesting part is *why* the gap closed now rather than earlier. Fourteen of those types are driven by a **timing track** — sweeps and pulses and jumps that happen on the marks — and until recently an effect had no way to read one. The State and Piano work added that plumbing for entirely different reasons, and the whole timing-event family fell out of it without anything in the VU Meter changing.

That's the general shape of it: the types that were missing weren't missing for want of arithmetic.

### What's new

**Timing-driven (14):** Timing Event Bar, Bars, Spike, Sweep, Sweep 2, Timed Sweep, Timed Sweep 2, Alternate Timed Sweep, Alternate Timed Sweep 2, Color, Pulse, Pulse Color, Jump, Jump 100 — plus Pulse.

Two details from the manual that shape them: a *timed* sweep "speed is based on timing mark spacing", so it crosses in exactly one cell and a fast passage sweeps fast; and the *alternate* pair "bounce back and forth", which is the same sweep with its direction taken from whether the mark is odd or even.

**Level and spectrum (8):** On, Color On, Level Jump, Level Jump 100, Level Pulse Color, Spectrogram Peak, Spectrogram Line.

### The jump types don't keep state

"Jump to the audio level when the sensitivity level is crossed" — and then fall back, which is the entire character of them. A decay needs to know when the crossing happened, and an effect that *remembered* that would give a different answer when scrubbed than when exported.

So the frame context now offers the analysed audio at any moment, not just this frame, and the jump types look backwards to find the last crossing. Same input, same output, whichever path renders it.

### One rename, done carefully

What this app called "Spectrum" is the manual's "Spectrogram". The list now offers the manual's name — but the old one is still a valid type and still renders, because sequences already say it and turning a stored effect into an unknown type renders nothing and looks like data loss. It's in the type union, out of the picker, with a test on both halves.

### Where the warning goes

VU Meter is only *sometimes* timing-driven, so the props panel's "this isn't pointed at a timing track" warning follows the selected Type rather than the effect name.

## The import mapping dialog

Importing a `.xsq` matched donor rows to your models **by exact name**. That is fine for a sequence built on your own layout, and useless for the case the manual is actually about — "importing purchased sequences from different vendors" — where none of the names are yours and the import silently brought in almost nothing.

So the mapping is now something you see and change before anything is created: every model and group in your layout gets a row, and you say which of the donor's rows feeds it.

**The donor's effect counts are shown**, because that is what the choice is made on. A row with two effects and a row with two hundred look identical by name, and the manual says the same: the counts help "you decide which elements are worth mapping".

**Names are still matched for you, as a starting point** — exactly first, then case- and space-insensitively, so "Arch 1" finds "arch1". Nothing fuzzier than that. A wrong guess puts someone else's effects on the wrong prop, and the entire point of the dialog is that you can see what it decided.

One donor row can feed several of your models, which is the manual's "these items can still be used multiple times even when grayed out" — a vendor's single arch often drives four of yours. Timing tracks are ticked separately from the models, because they belong to the sequence rather than to any row, and a phoneme track is frequently the thing you actually wanted.

Mappings save and load, and a loaded one can **replace** what's there or **add** to it, so several can be stacked.

### Convert and Import still agree

Tools > Convert has nowhere to put a dialog — it takes a file and hands back a file — so it maps by name, which is exactly what the dialog starts from before anyone touches it. Both now go through one function. A converter that matched names differently from the importer would produce an `.fseq` that didn't match what importing the same sequence would show, and trusting those two to agree is the whole reason to convert rather than import.

Two behaviours changed as a result, and both are improvements worth naming:

- **A donor row with no effects no longer creates an empty row.** It rendered nothing and cluttered the sequencer.
- **An unmatched donor row is only reported if it had effects on it.** Nothing was lost otherwise, and a vendor sequence carries plenty of empty rows — listing them buries the ones that actually had sequencing.

### The saved mapping file

xLights saves an `.xmap`. That format isn't documented in the manual, and guessing at it would produce files that look like xLights' and aren't. This writes its own JSON, with an extension that says so.

## Finding the beats in a track

The timing generators could put marks at a rate you chose — every 50ms, or 120 to the minute. Neither follows the song. This adds marks where the sound actually rises, which is what makes a timing track usable for sequencing *to a song* rather than to a click.

The method is spectral flux: how much the spectrum rose between one frame and the next, summed across the bands. A drum hit lifts many bands at once and spikes; a sustained note holds its bands steady and produces nothing after its attack. Only rises count — a note ending is not an onset, and counting falls would double every hit.

**The threshold is local, not global.** A quiet verse and a loud chorus have different baselines, so a fixed threshold either floods the chorus with marks or finds nothing in the verse. Each frame is compared against its own neighbourhood instead, which is what lets one sensitivity setting work across a whole song.

Three controls, each earning its place:

- **Sensitivity** maps onto a multiple of the local baseline rather than a raw threshold, because the useful range of a raw threshold depends on the track and the useful range of a multiple doesn't.
- **Minimum gap**, because a drum hit spreads over several frames and without it one beat becomes a cluster — which reads as a working detector until you zoom in.
- **Spectrum range**, so you can follow the kick or the hats instead of everything at once.

Plus keep-every-Nth, which is roughly how bars come from beats.

### The tempo is reported, not used

The detector estimates a tempo from the gaps between its own marks, folded into the range people read tempos in. It is only ever shown, never acted on: it answers the question you actually have when looking at a track full of new marks — *did this find the beat, or find noise?* Using it to snap or quantise would take marks that are right and move them somewhere wrong.

It declines to answer rather than guessing when the gaps aren't consistent, and one long pause between sections doesn't drag the estimate down.

### Where it lives

In the engine, not the web app. It is arithmetic over the analysed audio the renderer already produces, so it belongs where it can be tested against a *synthesised* track — a hit on frame 10 either produces a mark at 500ms or it doesn't, where a real song's beats are a judgement call.

## Papagayo `.pgo` import

Papagayo is what people used to break lyrics into phonemes before xLights could do it itself, and a lot of existing singing faces were built with it. Its files import now: each voice becomes three timing tracks — phrases, words and phonemes — and the phonemes track is what a Faces effect reads.

The manual's frame offset is there too, for the reason it gives: "Due to a performance limitation in the Papagayo software, a sequence often had to be broken up into segments. In which case the second segment had to be offset by the number of frames of the first segment."

### Three tracks, not one

xLights nests the three components inside a single timing track. This app's tracks are flat, so a voice becomes three of them. That is a real difference rather than a presentational one — here the three can be dragged out of alignment with each other in a way they can't be there — and it seemed better to name it than to gloss it. What matters for rendering is unchanged: a Faces effect reads the phonemes.

### Writing a parser without a specimen

There was no `.pgo` file to test against, and the manual describes the format only in prose and one screenshot: "The 4th line contains the total number of frames and the 5th line has the number of Voices in the file, followed by the details for each voice."

That's enough, because the format is **count-driven**: every list states its length before it starts. A wrong guess about the layout doesn't produce plausible garbage — the counts stop lining up and the parse throws. So the parser refuses anything that doesn't fit rather than returning what it managed. A leniently-read lipsync file would import as a track whose words drift out of sync partway through, which is far harder to notice than an import that said no.

Two details that follow from the format rather than from taste:

- **A word's frames are taken from the end of its line, not its text from the front.** A word containing a space would otherwise swallow its own start frame.
- **A phoneme has a start and no end**, so each runs until the next one and the last until its word ends. Without that rule the closing phoneme of every word would be an instant rather than a mouth position that is actually held.

## Matrix singing faces

The other half of Faces: a picture per mouth position, for P5/P10 matrices and pixel screens rather than coro props.

It was the smaller half, and worth saying why. The Pictures effect already decoded images, sampled them into the buffer and dealt with the row flip between an image's top-first rows and the buffer's bottom-left origin. That sampling loop is now shared by both, because two copies of a coordinate flip are two chances to get it wrong in different directions — and the symptom, a picture upside down on one effect but not the other, is the kind that gets blamed on the model rather than the code.

Both of the manual's placements: **Centered** keeps the picture's aspect ratio and only ever shrinks it, **Scaled** stretches X and Y separately to fill the matrix. A mouth position can carry a second picture for closed eyes — "by default, the same image is copied across", so one is optional.

### A correction

The previous release said Transparent Black was omitted because it "acts on a picture, and a node-range face doesn't draw one". That was true of the faces that existed then, and stopped being true the moment one could draw a picture: a face photo's background is black, and without this it covers whatever the layer below drew. It is implemented, and the note that explained it away has been replaced rather than quietly deleted.

### Pictures are decoded to the model's size

A face definition lives on the model row, which is fetched with every layout load — so ten full-resolution photographs there would be megabytes of JSON on every visit to the Layout page. Pictures are decoded down to the model's own resolution, capped at the same 64px edge the Pictures effect uses.

Nothing is lost by it: anything larger than the matrix is downscaled when drawn anyway, and the manual warns from the other direction that "high resolution image will not scale well to low resolution matrices".

### Importing a Matrix face

A Matrix definition in an `xlights_rgbeffects.xml` names image *paths* on the machine that made the show. They can't be read as node ranges — that would light arbitrary nodes rather than fail — and they can't be fetched.

What does come across is the definition itself: its name, its placement, and which mouth positions it had. The editor then shows those rows waiting for their pictures, instead of the import quietly losing that a singing face existed at all.

## Singing faces, for coro props

Faces was the last effect still listed as blocked on something this app can't have. The blocker was recorded as "a picture per mouth position" — and reading the *Singing Faces* chapter rather than just the effect page shows that's true of only one of its three definition types:

| Type | Use case | What it needs |
|---|---|---|
| Single Node | coro faces on dumb RGB / LOR channels | node ranges |
| Node Ranges | coro faces on smart pixels | node ranges |
| Matrix | P5/P10 matrices | an image per mouth position |

Two of the three are node ranges — the shape the State work already built. Those are implemented here. Matrix faces are not, and are now listed as their own row rather than hiding inside "Faces is blocked".

### What's in

Mouth positions driven by a phoneme timing track; eyes open, closed, off, or automatic; the outline; and the manual's palette table, which assigns each of the six swatches to a part (mouth, eyes, outline, outline2, eyes2, eyes3). Force Custom Colors on a mouth beats the palette, as it does for states.

**Automatic blinking happens only at rest.** The manual is specific — "blink every few seconds when the rest phenome is on" — so a face doesn't blink mid-syllable. It's driven by absolute time, so a scrub and a sequential export agree on when the eyes are shut.

**Suppress when not singing** hides the face between lyrics, with lead-in and lead-out *frames* either side and an optional fade rather than a cut. Those settings are in frames, which is why the frame context now carries the sequence's frame time: a frame isn't a duration until you know it.

### The phoneme names are data, not a list

The manual never writes the phoneme set down — it only appears in screenshots. Hardcoding a guess would fail the worst way available: a label naming a mouth the definition hasn't got renders as a closed mouth, with nothing to say why.

So a face carries whatever names it was built or imported with, matched case-insensitively, and a new definition is seeded with the standard set as a starting point you can edit. The effect's Phoneme dropdown lists *that face's own* mouths rather than an assumed set. If the standard names turn out to be wrong, nothing breaks — the definition is still the authority.

A label that names no mouth falls back to rest rather than to nothing, so a face pointed at a lyric track that hasn't been broken down closes its mouth instead of vanishing.

### Import

`<faceInfo>` is read on import: `mouth-<PHONEME>` attributes, the eyes and outline parts, and per-mouth forced colours.

**A Matrix definition is skipped rather than imported.** Its values are image paths, and reading them as node ranges wouldn't fail — it would light arbitrary nodes. Of the three possible outcomes (right, visibly wrong, quietly wrong) that's the one worth spending code to avoid.

### Still outstanding, and now named separately

Matrix faces; **Import Lyrics / Breakdown Phrases / Breakdown Words**, which needs xLights' pronunciation dictionaries; and Papagayo `.pgo` import. Without the dictionary the manual's own manual path still works: type phoneme labels onto a timing track and the effect runs off them.

## A MIDI file becomes a timing track

The Piano effect lists a MIDI file as one of its notes sources. Shipping the effect left that as the one real gap, so this fills it — but as an *import* rather than as a second way for the effect to read notes.

That's the decision worth stating. A `.mid` becomes a **timing track** whose cells are labelled with the keys sounding in them, and the effect reads it exactly as it reads a hand-typed one. The notes end up visible and editable: a wrong chord is a label you can retype, not a file you have to re-export from something else. It also means the same import serves anything else driven by labels.

### The reader

Formats 0, 1 and 2; running status; tempo changes; SMPTE as well as metrical division. Three things in it are the ones that actually bite:

- **A note-on with velocity 0 is a note-off.** It's the usual way real files end notes. Read as a start, every note in such a file stays open forever.
- **Tempo changes are pooled across all tracks.** Format 1 keeps the tempo map in the first track alone and it applies to every other one; reading tempo per-track leaves the notes running at the default 120bpm.
- **Overlapping notes of one pitch pair one at a time.** Closing every open note on the first note-off gives one long note and one that never ends.

Events it doesn't need — controller, pitch bend, program change, sysex, other meta — are skipped by their own lengths rather than guessed at, because a wrong guess at any of them turns the rest of the track into noise.

### Turning notes into cells

Boundaries come from note **ends** as well as note starts. A bass note held under a melody has to still be down when the melody moves; a track built from onsets alone would release it the moment anything else started. Between boundaries the label lists everything sounding, and a stretch with nothing sounding gets no label at all, so the keyboard empties instead of holding the last chord.

Labels are written as note names by default (`C4 E4 G4`), which say what they are when you expand the track; MIDI numbers are the other option. A test walks every key from A0 to C8 and asserts the effect's own parser reads back exactly the key that was written.

Two of the manual's Piano settings live here rather than on the effect, because they describe the file and not the rendering: **Midi Start Time Adjust** ("in case they are slightly off from each other") and **Midi Speed Adjust**.

A negative start adjustment can push notes off the front of the sequence. A note *straddling* zero is clamped to it — it's still playing when the sequence starts — while one that ends before zero is dropped. Clamping both ends of an early note to zero instead leaves a zero-length note that disappears later, somewhere with much less to say about why; a test caught exactly that.

## Two effects that weren't actually blocked: State and Piano

Both were recorded in the coverage doc as needing "definition files" we didn't have. Re-reading their manual pages showed that neither does.

**State's** definitions are node ranges — "From the drop down box, select either Single Range or Node ranges" — which is the same notation sub-models already use, and the same parser. So a state is now a property of the model, edited on the Layout page and read from `<stateInfo>` on import. **Piano's** notes come from "a timing track source... this is the preferred option", whose labels are key letters or MIDI values. Neither needed a file format we don't have; both needed the machinery already here to be pointed at them.

That is the useful part of this change: a row marked blocked is worth re-reading rather than inheriting.

### What a label-driven effect needed

Nothing in the engine had this shape before. Every other effect renders from its own parameters and the playhead; these two render from *words someone typed on a timing track*. Three things had to reach an effect that never had them:

- **The cells of the track it names.** A timing track is marks plus a label per mark; a cell is the span between one mark and the next. Labels are paired with their marks *before* sorting, because a label belongs to the mark it was authored against — pairing after sorting silently relabels the whole track, which is a bug the song-region code had and this one has a test against.
- **Real time.** A countdown counts real seconds, and a cell sits at an absolute millisecond; the 0..1 position an effect already gets can't stand in for either.
- **The model's own nodes.** State lights *particular nodes by number* rather than filling a shape — it is the only effect family that addresses the model that way — so it needs to find each node's pixel in the buffer.

All three arrive on the frame context, and only the effects that ask for them pay anything.

### One place that resolves what a row renders

Six render paths each did the same inline "copy the effect, resolve its palette" — fine while the palette was all there was to resolve. It isn't now: these effects are rendered from the sequence's timing tracks and the model's state definitions, and a preview that resolved them differently from the export would put a different show in the yard than on the screen. All six now go through one function.

A sub-model row gets the timing tracks but *not* its parent's states: a state's node numbers are counted against the model they were defined on, so applying them to a sub-model's own numbering would light the wrong nodes.

### State

All four modes. **Default** follows the track — the label at the playhead is the state, which is how a lyric or phoneme track drives a prop. **Iterate** ignores where the cells fall and loops the labels evenly across the effect, per the manual's "loop around equally for the timespan duration selected". **Countdown** counts down to zero across the effect and **Time Countdown** counts real seconds from a written time, both spelling the number out in seven-segment digit states — 123 becomes `100,20,3`, exactly as the manual tells you to type it by hand.

Zeros are lit: counting down through 100 has to light both right-hand zeros or the sign reads as a bare "1".

All four colour modes (Graduate, Cycle, Allocate, Number), and Force Custom Colors per state, which beats every mode.

### Piano

Both types. **True Piano** draws a keyboard — whites carrying the layout, blacks narrower and sitting on the seams — so it's a key you can point at rather than a bar chart; it draws the keyboard even when nothing is playing, which is what makes it one. **Bars** draws only what's playing, which is what reads from across a yard.

Labels parse in the manual's three forms: MIDI codes, `C4`/`c#4`, and a bare `C` "assumed to be 4th octave", separated by space, comma or colon. The note-and-octave form fixes the numbering at C4 = 60, so `C4` and `60` name the same key — the manual's table says 64 is Middle C, which would put its own two forms a third apart and disagree with every MIDI file a sequence might be built from.

With no track, the analysed spectrum drives the keys, which is the manual's own "modulate based on the beat and frequency of the sequence audio" — and keeps the effect useful on a song nobody has transcribed. MIDI *file* import is the thing still missing here, not the effect.

### The state editor

On the Layout page, beside the sub-model editor. Up to the manual's 40 states per definition, each showing live how many nodes it resolves to and how many are past the end of the model — the two ways a range list fails silently.

One button adds a whole seven-segment set: the 42 predefined names (`1`–`0`, `00`–`90`, `100`–`900`, `1000`–`9000`, `Colon`, `Dot`). The names are fixed by the manual and only the node ranges are yours, so typing them out by hand was 42 rows of chore standing between someone and a countdown sign.

The props panel warns when a State or Piano effect isn't pointed at a track this sequence has — the same silence the canvas-mode warning covers, and worth the same line of UI.

## Re-read all 176 manual pages, and found a tab we'd never named

The coverage doc was built by reading the whole manual once. I re-fetched every one of the 176 indexed pages — **88,710 words** — and audited the doc against them rather than against my memory of them.

Two things came out of it.

**A whole settings tab was missing from the inventory.** File > Settings > **Colors** — the app's own chrome colours — had never been named in `docs/MANUAL-COVERAGE.md` at all. Not marked ❌, not marked as a non-goal: simply absent, which is the one failure mode an inventory is supposed to make impossible. It's implemented now, and the row says how it was found.

**The manual's own `llms-full.txt` bundle is incomplete.** 25 of the 176 indexed pages are absent from it, including Sketch, Tendrils, Spirograph, Candle, Fireworks, Galaxy, Garlands, Guitar, Life, Lightning, Liquid, Marquee, Meteors, Plasma, Shimmer, Snow Storm and Generate Custom Model. Anything auditing this manual from that bundle alone would silently miss them — which is exactly the kind of gap that looks like completeness. The coverage doc now says so.

### Settings > Colors

Timing-track headers and marks, effects and selected effects, row headings and their text, gridlines, the waveform and its background, and the layout's model / selected / overlap colours. Reset, export and import, as the dialog offers.

It matters more than a theme usually would: a sequencer grid is dense, people work in one for hours, and someone colour-blind may need the selected/unselected pair to differ by more than hue.

Values are **validated as hex on read**. They go straight into a canvas `fillStyle`, where a bad value paints *nothing* rather than erroring — which on a sequencer grid reads as effects that have vanished. And an import needs at least one real colour in the file, or any JSON at all would "import" as the defaults and look like it worked.

## The last three that weren't blocked

`docs/MANUAL-COVERAGE.md` had four rows reading ❌ and a note saying which were blocked and which were simply not built. Three were not blocked. They are built.

### Tools > Convert

`.xsq` → `.fseq` without creating a sequence. Pick a file, get a file.

It uses **the importer's own mapping**, and that's the point rather than a convenience: a converter that mapped differently would produce an `.fseq` that didn't match what importing the same sequence would show — and trusting those two to agree is the entire reason to convert rather than import. So the mapping came out of the import page into a tested module that both now call.

Frame rate and length come from **the file being converted**, never from this project. Converting must not quietly re-time someone's sequence.

### Export model as video

One model's frames recorded to a video file. It answers the question the house preview can't — *"what will this prop actually look like?"* — as something you can send to someone who isn't sitting at the app.

Two things it has to get right:

- **Frames are drawn on a timer, not as fast as possible.** `captureStream` samples the canvas in real time, so racing through them would produce a three-second video of a three-minute sequence.
- **One sequencer for the whole export**, exactly as the `.fseq` path does it. A fresh `renderRowAtMs` per frame replays every stateful effect from its start each time, which turns a minute of video into minutes of waiting.

Whether the browser can encode at all is checked **up front**, so the button says so rather than failing on click after someone has waited for a long sequence to set up. And the file extension follows the container the browser actually chose — a `.webm` named `.mp4` won't open in the player someone hands it to.

### Detachable panel windows

Panels can be torn off into their own window, synced over `BroadcastChannel` like the popped-out preview and on a **real route** for the same reason: it survives a reload and can be bookmarked onto the screen it belongs on.

The sequencer stays the single source of truth. A torn-off panel asks for a snapshot when it opens and re-renders from what it's sent; it has no save path of its own, because a panel that could write would be a second writer racing the tab that owns the autosave.

### What's left

**One row.** The vendor model library needs xLights' own web service — a third-party dependency, not a piece of app work.

**Tools > Test** stays 🚫 for a harder reason: it sends E1.31/DDP live, and a browser cannot open a UDP socket at all. No amount of work here changes that, and it's precisely why FPP Connect uploads a `.fseq` to a player instead of streaming to controllers.

## Perspectives

A saved arrangement of which panels are showing. This page has a lot of them now — Views, Presets, Regions, Preferences, Models, Timing, FPP — and getting back to a working arrangement after opening three of them is otherwise a matter of remembering which ones you had.

**Applying one sets every panel**, not just the ones it lists. Restoring an arrangement means closing what it didn't have open as much as opening what it did; a half-applied arrangement isn't the arrangement.

**Saving over a name replaces rather than duplicating.** Two perspectives called "Sequencing" are indistinguishable in the picker, and picking the wrong one is exactly the failure a picker exists to avoid. The list is kept sorted so its order doesn't depend on the order things were saved in.

A panel name the app no longer has is dropped on load rather than restored — otherwise a panel renamed or removed since the perspective was saved would come back as one that doesn't exist.

Stored per-browser, like preferences and for the same reason: an arrangement of panels belongs to the person looking at them, not to the show.


## Layout previews, and the pixel editor

**Layout previews** are a named view of *some* of the models — a way to work on the roofline without the mega tree in the way. All Models, Default and Unassigned are built in; any other preview is one the models name for themselves.

A model's preview comes from its own attribute or from a **group** it belongs to, which is how a whole section of a yard moves into one in a single edit. The named list is computed from the models rather than stored: a preview with no models has nothing to show, and one that existed only in a list would linger after the last model left it. **Unassigned** exists for the same reason it does in xLights — it's what makes a model that was missed findable rather than invisible.

**The pixel editor** is the matrix drawing tool: *"amend a picture or draw your own pictures or animations."* Eight colour wells, left button draws, right erases, drag to paint a stroke.

It draws **straight into the Pictures effect's image**, which is where this app already stores a picture — so what's drawn renders on the model immediately, with no file to save and reload. That's the whole point of it over a paint program: the grid *is* the model. It flips y between the display and the buffer, or everything drawn would render upside down on the prop.

### A control that was missing entirely

Wiring the editor turned up that `decodeImageForEffect` had existed for some time **with no control anywhere in the app**. A Pictures effect could hold an image only if one had arrived with an imported sequence — there was no way to put one there. It has a file picker now, next to the editor.

## Generate a Custom model from a photo, and Replace Model

**Generate Custom Model** builds a model from a picture of the prop. The props that most need one — a hand-made snowflake, a wire-frame reindeer — are exactly the ones with no library entry, and hand-writing a node grid for anything past a dozen nodes is why people don't.

Bright pixels become nodes, with a threshold, a grid width and all four wiring orders. Three things it gets right on purpose:

- **Each cell takes the brightest pixel of the block it covers, not their average.** A single-pixel wire frame averaged over a block disappears — and a wire-frame prop is exactly what this is for.
- **A transparent pixel is never a node**, whatever colour it nominally holds. A PNG cut-out is the most likely input, and its background is transparent rather than black; reading colour alone would fill the whole grid.
- **All four wiring orders are offered, because the number *is* the channel order.** A prop wired back and forth but numbered straight will chase backwards on alternate rows — which looks like a broken effect rather than a mis-numbered model.

A test asserts the grid it writes is one `parseCustomModelGrid` reads back. That's the whole contract of the format, and it's the kind of thing that's easy to get subtly wrong and never notice.

**Replace Model** changes what a model *is* while keeping where it is and what it's wired to. Deleting and recreating loses its position, its controller assignment and its sub-models — which is most of the work that went into it. `raw_attrs` is cleared on the swap: the attributes are per-type, and a Tree's `TreeDegrees` left on an Arches model is a value nothing reads that would reappear if the type were ever changed back.

## Audio scrubbing

Drag across the waveform and the track plays under the pointer. It's how a downbeat gets found by ear rather than by counting — a plain seek moves the playhead in silence, which is what makes lining effects up to music slow without this.

The burst is **stopped on a timer** rather than left running. A scrub that kept playing would drift away from the pointer within about a second, and dragging back would then be seeking against audio that had already moved on — which feels worse than no scrubbing at all.

It only starts a burst when the transport is stopped: scrubbing during playback would fight the thing already playing. And a blocked autoplay is swallowed rather than surfaced — the playhead still moves, which is the part that matters; the sound is the bonus.


## Song structure regions

*"Let you divide the sequence timeline into named, colored sections — for example Intro, Verse, Chorus, Bridge and Outro."*

They earn their keep in **bulk**. Once the timeline is labelled, "copy the chorus's effects onto the second chorus" is one action instead of a rubber-band selection across a hundred rows that has to land on exactly the right boundary.

Sections can be added at the playhead, or generated from a timing track: *"one region for each timing mark, using the timing mark's label as the region name."* An unlabelled mark is named by its position rather than left blank — an unnamed region is indistinguishable from its neighbours in the one place regions are meant to help.

Three decisions worth stating, each pinned by a test:

- **Stored as boundaries, not start/end pairs.** A region ends where the next begins, so keeping both would let the two disagree — and a gap or an overlap between two sections isn't a state the timeline can actually be in.
- **A straddling effect belongs to the section it began in.** Splitting it would change what the sequence renders; counting it in both would duplicate it on every copy.
- **A copy that wouldn't fit is skipped, not trimmed.** A half-length copy of an effect is a different effect, and silently shortening one is worse than not copying it.

And one I got wrong on the first pass and the test caught: labels are paired with their marks **before** the marks are sorted. Sorting first and then indexing the labels hands "Chorus" to whichever mark happened to be earliest — the same thing only when the track was already in order.


## A Channel Block was claiming three times the channels it needed

The Channel Block model shipped a fortnight's worth of PRs ago with the right geometry and the wrong output. Every model in this app put three bytes on the wire per node, because every model until then was an RGB pixel.

A Channel Block isn't. The manual describes it as a way to *"model generic channel to be used or AC Lights, relays, smoke machines"* — **each channel drives one device, so each takes one byte.**

At three bytes a channel, a 24-channel relay board claims 72. Every model after it on that controller is shifted by 48 channels. Nothing errors; the wrong props light. It's the same class of failure as the overlapping-channel bug the visualiser exists to find, arriving by a different route — and it was in code I wrote earlier in this same run.

With it, the setting that decides *which* of a rendered pixel's channels supplies that byte: **Channel Color**, model-wide and per channel. *"If set to 'White' all three RGB channel values will be use... If set to 'Red' only the Red channel values will be use."*

White takes the **brightest** of the three rather than their average. An average would put a pure red effect out at a third power, which reads as a relay that never quite closes. And an unknown colour in the per-channel list becomes White rather than being dropped — dropping it would shift every channel after it along by one, which is the same silent mis-addressing all over again.


## The radial effect wheel

*"Double-click empty sequencer grid area displays a radial effect wheel for quick effect placement."*

It exists because the alternative is a trip to the palette on the far side of the screen and back. The wheel opens **where the pointer already is**, and the effect lands there rather than at the playhead — so the whole gesture is double-click, flick, release. That's what makes it worth having over a menu.

Only on empty grid: double-clicking an effect is how you'd open it, not how you'd place another on top of it.

Its list is **the single-letter shortcut list**, not a second copy of one. The wheel and the keyboard are two ways at the same set of effects, and a wheel with its own list would be a third place for that set to drift.


## Preferences, and the time display

A Preferences panel — and a deliberately short one. **Every setting in it drives something**, with a test asserting that no preference exists which nothing reads. xLights' Settings dialog has eight tabs, most of them configuring machinery this app doesn't have (output devices, backup paths, services); offering those would be a screen full of switches with nothing behind them, which is worse than a short screen.

What's in it: **time display format** (minutes:seconds, plain seconds, or frames), **default effect length**, **snap effect edges to timing marks**, and the **autosave interval** — where 0 genuinely turns autosave off, for someone who'd rather save deliberately than have a half-finished edit persisted.

Frames are counted against the sequence's own frame rate rather than a constant: a 20ms sequence and a 50ms one number the same second very differently, and a frame count that assumed one of them would be wrong for half of all shows.

**Preferences live in the browser, not with the project.** A preference belongs to the person at the keyboard, not to the show — one that travelled with the project would let two people editing the same sequence change each other's settings.

Stored values are merged over the defaults rather than replacing them, so a preference added later doesn't come back `undefined` for everyone who already has a stored bag — which is how a number field ends up NaN and a duration ends up zero. And everything is clamped on read: a hand-edited bag can't produce a zero-length default effect, which couldn't be selected on the grid and so would be unrecoverable once made.

I cut one setting while building this. "Confirm before deleting several things at once" was in the panel until I checked what read it — nothing did. Shipping it would have been the exact thing the test above exists to prevent.


## Keyboard shortcuts and a command palette, from one registry

xLights documents around sixty keyboard shortcuts. We had a handful, dispatched from a `switch` statement — the arrangement where a shortcut, a help list and a palette drift apart until a documented key quietly does nothing.

So all three now come from **one registry**. A command carries its own key, which means a shortcut can't exist without a command, and a command can't be given a key nothing dispatches.

**What's in it:** transport (play, start, end, nudge), timing (`t` to add a mark, `s` to split the one the playhead is inside), edit (delete, copy, paste, duplicate, undo, redo), zoom, and **all fifteen of xLights' single-letter effect shortcuts** — `b` Bars, `f` Fire, `r` Ripple, and the rest.

Three details that are easy to get wrong and are pinned by tests:

- **Case is significant**, as it is in xLights: `o` is On and `O` is Off, `f` is Fire and `F` is Fan. Lower-casing the key would collapse each pair, and which effect you got would depend on list order.
- **Modifier commands match before bare letters.** `c` is xLights' Curtain shortcut, so without that ordering every Ctrl+C would also drop an effect on the grid.
- **`=` counts as `+`.** On most layouts the zoom-in key is typed without shift, so accepting only `+` makes the documented shortcut do nothing on a US keyboard.

A further test asserts **no two commands answer the same key** — two matches means the second is unreachable, and which one loses depends on list order rather than on a decision anyone made.

**The command palette** (Ctrl+Shift+K, the key the manual documents) searches the same registry, ranks a prefix match above one buried mid-string, and shows each command's key beside it — which is how anyone learns sixty shortcuts without reading a list of them. It also carries the commands that have no key at all, like Export .fseq: a command reachable only through a menu is exactly what a palette exists to replace.

## A photo of the house behind the layout

The 2D layout's background image — the thing that turns it from a diagram into a plan of *a particular house*. Pick a photo, and props can be placed where they physically are instead of by eye against an empty grid. An opacity slider keeps it from competing with the props.

**It's composited as a sibling of the canvas, not drawn into it.** The canvas redraws on every `pointermove` of a drag, and re-painting a 1600px photo on each of those is the one thing that would make dragging a model feel heavy. As a sibling the browser composites it and it costs nothing per frame.

**Downscaled on the client before it's stored.** A photo straight off a phone is several megabytes; this lives in the layout's settings row, which is read on every page load. The long edge is capped at 1600px — enough to show a roofline clearly at any zoom the canvas offers, which is all this image ever has to do. Encoded as JPEG rather than PNG: it's a photograph, and a PNG of one is several times the size for no visible gain behind a half-transparent layer of props.

Two things are checked rather than trusted. A file that isn't an image returns an error instead of throwing — a file input is exactly where the wrong file gets picked, and a throw in that handler reaches the app's error overlay and takes the page down. And the stored value is validated as an image data URL on both sides, because it's handed straight to an `<img src>`: a stray URL there would have the layout page fetch whatever it pointed at.


## Model-list conveniences, and auto start-channel allocation

Four items off the Layout tab, all of them things you do constantly on a real show.

- **Filter the model list** by name, type or controller — the three xLights offers. A show has a hundred-odd models, so scrolling for one is the single most repeated action on the page.
- **Clone a model**, N copies in one action. Geometry, sub-models and string type come across; each copy is offset from the last, because a run placed on top of itself is one indistinguishable pile that has to be dragged apart before it can be told apart.
- **The controller assignment is deliberately not cloned.** Two models on the same channels is a show-day bug nothing errors on — and a clone is exactly how you'd create one by accident. Copies come out unassigned, ready for:
- **Auto-assign start channels.** First-fit packing of every unassigned model into the first active controller with room, starting after everything already on it.

The allocator's rules are the interesting part. **Existing assignments are never moved**: someone who hand-placed a model has done so for a reason, usually because a physical port starts there, and repositioning it would break the wiring rather than the spreadsheet. **A hand-made gap stays a gap**, for the same reason — it's usually a port boundary, and the model tucked into it would be the one that broke. It's first-fit rather than best-fit on purpose: best-fit packs tighter but scatters related props across controllers, and a run created together almost always wants to be contiguous.

It reports what it couldn't place and why, rather than silently leaving models loose. And a test asserts the thing that actually matters: **run the allocator, apply it, and the collision visualiser has nothing to complain about.**


## A controller visualiser, and the bug it exists to find

A Controllers tab on the Layout page: each controller's channel span drawn to scale, with every model assigned to it, plus how many channels are free and how many run past the end.

**The reason to build it isn't the picture.** Two models assigned to overlapping channels is a show-day bug of exactly the worst kind — nothing errors, the `.fseq` exports, and two props light each other's effects. Nothing in the app surfaced that, because each model's assignment is validated against the *controller's* span when it's made and never against the other models already on it. Collisions are now called out on the bar, in the list, and on the tab itself.

Models that merely sit back-to-back are deliberately not flagged: that's the normal, correct arrangement, and warning on it would make the warning useless by firing on every well-packed controller. A model reports *all* of its collisions rather than just the next one along, which is what you need when a mis-typed offset buries three props at once.

Overrun is worth having separately from the per-assignment check: that check catches a bad offset when it's typed, but not a model whose node count grew afterwards — editing a matrix's size doesn't revisit its offset.

Unassigned models get their own section. They still export, written after every controller-routed span, but their channel numbers move whenever a controller assignment changes — which is worth being able to see rather than infer.

Missing, and recorded: xLights' physical port/string breakdown, which needs per-port controller definitions this app doesn't model.


## Sub-models can be made, not just imported

Sub-models already imported, resolved to their own geometry, appeared in the sequencer and rendered in both the preview and the `.fseq` export. What was missing was any way to **make** one — or to fix one that came in wrong. The only route was to go back to xLights and re-import.

That gap mattered more than it sounds. A sub-model is how the star on a mega tree, or one arch of a set, gets its own sequencer row. Without an editor, a show that didn't already have the sub-model you wanted couldn't get it here at all.

The editor sits on the Layout page beside the property grid: add, rename, delete, switch between node-range and sub-buffer kinds, and edit the rows. **Each spec shows what it actually resolves to against the parent's real node list** — a range list is very easy to get wrong by one, and the symptom otherwise is a sequencer row that renders on nothing, silently, because a sub-model selecting no node is dropped at render time. A spec that selects nothing, or names nodes past the end of the model, says so in the editor.

Removing the last row of a range sub-model leaves an empty one rather than none, for the same reason: a range sub-model with no rows selects nothing and would simply vanish from the sequencer without ever explaining why.

Still missing: xLights' Draw Model and Generate Slices tools, which generate a spec from a drawing rather than from typed ranges.

## Sketch — the last effect this engine could render

**44 of 55.** More to the point: every effect renderable with what the engine already has is now implemented. The remaining eleven all need infrastructure that's a deliberate non-goal — face and state definitions, DMX fixtures, shaders, video.

Sketch is *"a path (a 'sketch') progressively drawn onto your model over the duration of the effect."* The path is stored as text so it round-trips through the sequence body like any other param, in the smallest notation that expresses what the effect needs — `M` starts a stroke, `L` continues it, coordinates are 0..1 so **a sketch traced once renders on any prop**, whatever shape it is.

Progress is measured along the whole sketch's length rather than per stroke, so a long stroke takes proportionally longer to appear than a short one. That's the difference between something that looks like *drawing* and something that looks like each stroke taking its turn. A segment straddling the visible edge is drawn only as far as that edge reaches, so the line grows smoothly instead of jumping a whole segment at a time.

**Draw Percentage** decides how much of the effect the drawing takes, with the finished sketch staying visible afterwards. **Motion** replaces it with a moving window — *"only a percentage of it is rendered at any given moment"* — and the two are mutually exclusive, as the manual says. Each separate stroke takes the next palette colour.

It comes with a **tracing canvas** in the props panel, which is what xLights' Effect Assist panel is for: click to drop points, "Finish stroke" to start the next colour. The background-image tracing aid is deliberately absent — the manual is explicit that *"the image is not rendered into the effect output; it is only there to help you trace"*, so leaving it out changes nothing about what a sketch renders.


## Effect presets

Save an effect's whole configuration under a name, and drop it somewhere else later "without recreating them from scratch". Params, palette (colour curves included), blend mode, mix, transitions and layer settings — everything about an effect **except where it is**.

A preset keeps a *duration*, not a start and end. A preset saved from an effect at 12.4s isn't about 12.4s — it's about what that effect looked like — and carrying the absolute times would mean subtracting them back out at every apply, with the result depending on where it happened to be saved from.

Organised into groups, the manual's own arrangement. Exported and imported as `.xpreset` files, and the file deliberately doesn't contain its own name or group: the manual has the *importer* supply both — *"a preset will be created under the highlighted group with the name of the selected file"* — so what's in the file is the configuration, not where it's filed. A file that isn't a preset comes back as null rather than throwing; a file picker is exactly where the wrong file gets chosen, and a throw there would take the tab down.

**apps/web has a test runner now.** It had none, so the pure logic there — the code deciding what gets rendered and what gets saved — went unchecked. The first thing it caught was real: Laravel's `validate()` returns only the keys that have rules, so reading the preset's `settings` from the validator's output was silently dropping **every effect parameter**. Presets would have saved, listed, applied — and come back as bare defaults.


## Views

xLights' sequencer Views: *"a view is used to be able to easily select a list of models **and the sequence in which they are to be displayed** on the sequencer."* Named, ordered subsets of the grid's rows, picked from the toolbar.

They're saved on the **layout**, not the sequence, because the manual is explicit: *"views work across sequences, so once you have setup a view with the models that you require, if you open any sequence, that view is available to use in that sequence."* A per-sequence copy would have to be duplicated into every new sequence and would drift apart the moment a model was renamed.

The **Master View** isn't stored at all — it's *"a special (system created) view"* containing every row, which makes it exactly the absence of a selection.

The order is the point of a view, so it's editable in place with up/down arrows rather than by rebuilding the list. A row a view names that the layout no longer has is skipped rather than left as a gap — which is what happens as soon as a model is deleted after a view was saved.

Views ride in the layout's existing settings JSON rather than earning a table: a view is a name and an ordered list of row keys, read and written whole, and nothing joins against one. The write merges rather than replacing the column, so it can't clobber anything else stored there — there's a test for exactly that.

This is distinct from the existing Models panel, which stays: that's a per-sequence scratch toggle kept in localStorage, and a view is a saved, shared, ordered thing.


## Colour curves, and the last of the blend modes

**Blend modes are now 24 of 24.** Colour curves are in, both kinds.

### Colour curves

A palette swatch normally holds one colour for the whole effect. A colour curve lets it change — *"where previously the same color value would have been displayed for a particular segment duration it can now be made to change within that segment duration."* The manual splits them in two, and they really are different mechanisms:

- **Time based** — *"will change color over the duration of the effect."* Resolved once per frame, before any effect runs, so **all 43 effects gain it without knowing it exists** — the same trick value curves already use for numeric params.
- **Spatial** — *"will change over the models X/Y location. A spatial color curve has direction."* This one can't be collapsed per frame: within a single frame the swatch is a different colour in different places. Making all 43 effects position-aware for one feature isn't a trade worth taking, so instead the layer is rendered a handful of times, each with the palette resolved at a different point along the curve's axis, and each pixel is taken from — or blended between — the renders nearest its own position. **That's exact for any effect whose output is linear in its palette** (an effect picks a swatch and scales it, which is nearly all of them) and close for the rest. The extra renders are only paid for by a layer that actually uses a spatial curve, capped at eight.

Gradient and None blending, all four directions, up to the manual's 40 markers. The props panel gets a `~` button per swatch and an editor with a live gradient strip — a curve is very hard to reason about from four numbers and easy to see.

One thing worth noting: all five places that converted a stored palette (`preview`, popped-out preview, group rows, sub-model rows, export) now go through one engine function. A swatch holding a curve that reached the old `parseInt`-based hex parse would have come out **white**, silently, in the yard.

### The last five blend modes

- **Bottom-Top** and **Left-Right** — the layer below shows at one edge of the model and this layer at the other, mixed across the span. These had been deferred because *"they need the pixel's position, and the blend function is given only two colours."* The answer turned out to be that the layer stack already composites in node space and knows the geometry, so it can hand the position down — and only three of the twenty-four modes read it, so it's an optional argument rather than noise threaded through the rest.
- **Morph** — *"will magically make effect 1 'morph' into effect 2 during the length of the timing cell that the effects are in."* So its mix comes from how far through the effect the playhead is, not from the Mix slider.
- **Suppress Until Frame** and **Freeze At Frame** — not really blend modes at all: both are about *when* a layer shows rather than how it combines, so they move or withhold the moment the effect renders at. Suppress keeps the effect running underneath while hiding it, which is exactly what "warming up" an effect with unwanted opening frames means; a version that simply started it late wouldn't do that.

## Five more model types

**12 of xLights' 21 becomes 17.** Spinner, Cube, Sphere, Channel Block and Image now import, render and appear in the drag-create palette. Until now a show containing any of them imported them as labelled placeholders — kept, but inert.

- **Spinner** — arms radiating from a centre, with hollow percentage, arc spread, start angle and zig-zag wiring. The buffer is arms × lights-per-arm, so running across it goes *around* the spinner and running up it goes outwards along every arm at once. Zig-zag reverses the wiring on alternate arms without moving a light: a bulb doesn't change position because of how the wire reaches it.
- **Cube** — the manual is precise about the tension here: *"while the model is 3D, xLights renders the effects in 2D."* So the nodes stand in a real box — `screenZ` carries the depth, and the preview shows a box rather than a flat grid — while the *buffer* is the box unwrapped, each depth layer laid side by side. Cylinder is the same nodes wrapped round instead of folded square, with Width becoming the circumference.
- **Sphere** — strings running pole to pole, each at its own longitude, between a southern and a northern latitude. Its buffer is strings × nodes-per-string, which is the same buffer a matrix of those counts would get, so an effect written for a matrix works on it unchanged. Half a sphere spreads the *same* strings over 180° rather than dropping half of them.
- **Channel Block** — not a shape at all: *"can be used to model generic channel to be used or AC Lights, relays, smoke machines."* A row of independent cells, one per channel, so a chase across the buffer steps through the devices in order. Giving it a shape it doesn't physically have would be worse than admitting it's a strip of switches. (Its per-channel Channel Color setting isn't implemented — that's channel assignment on export, not geometry, and the coverage doc says so.)
- **Image** — *"used to represent single channel props like blow-molds, inflatables or incandescent cutouts."* The whole prop is one channel, so one node is the honest geometry; the picture is how the layout draws it, not something to light per pixel.

**Label stays out, and that's the right answer**: *"a simple text model that displays a line of text directly in the layout and preview. It does not control any lights or channels."* It's an annotation. It's now recorded as a deliberate non-goal rather than a gap, and it's what the tests use as their example of a genuinely unsupported type — a role Spinner used to play, before it became real.

Each type is also in the property grid, reading the pre-2026.04 `parm1`/`parm2`/`parm3` names as well as the descriptive ones — otherwise every one of these would import at a library default instead of its real size, which is most of the shows that exist.

## Canvas mode, and the three effects that needed it

Kaleidoscope, Warp and Adjust have sat in the coverage doc under *"needs a canvas the render pipeline doesn't have"* for three passes. They aren't ordinary effects: each one **modifies the layer below it** rather than drawing anything of its own. The manual is blunt about it — Kaleidoscope *"is a canvas mode effect. By itself it does nothing."*

The mechanism turns out to be small. An ordinary layer is handed a blank buffer; a **Canvas** layer is handed what the layers underneath it produced. The layer stack already composites in *node* space, so the seed goes through node colours — which is the only honest route when the layer below may have rendered into a differently-shaped buffer under its own render style. One inverse of the existing node mapping, one check in the stack, and the whole family becomes writable.

**Canvas is also the blend mode**, and it isn't a way of combining two colours: the effect was given the background to work on, so what it returns *replaces* it. That matters for exactly the case a Normal blend would get wrong — a pixel the effect deliberately cleared. Under Normal the background would show through and every reveal-style warp would be a no-op.

### The three effects

- **Kaleidoscope** — samples a region and mirrors it. The fold is a triangle-wave reflection rather than a wrap, because a wrap tiles the sample and a tiled sample is a grid, not a kaleidoscope. Square, Triangle and Rectangle sample shapes, with a centre, size and rotation. The source is copied before the pass: the fold reads cells the pass is also writing, and sampling in place would mirror pixels that had already been replaced — a bug that produces a plausible-looking pattern and can't be spotted by eye.
- **Warp** — eight distortions, each expressed as one displacement: *where does this pixel read from instead of itself*. Ripple, Single Water Drop, Circle Reveal, Banded Swirl, Circular Swirl, Wavy and Drop, plus Dissolve, which is the exception that removes pixels rather than moving them. Treatment (Constant / In / Out) decides whether the distortion loops or runs once, and in which direction.
- **Adjust** — all ten channel modes: offset by value or percentage, set a floor/ceiling/range, shift with wrap, prevent a range, reverse. Set Range *rescales* into the range rather than clipping to it, so the shape of what the layer below drew survives. Alpha is left alone throughout — changing coverage as well would make "Set Minimum" light pixels the layer below had deliberately left dark.

### Not rendering is the failure mode here

A canvas effect on a non-Canvas layer renders nothing, with no error — the sequence looks fine because the layer below still shows. So: the props panel warns when one is placed on a layer that isn't in Canvas mode, and the test suite's existing "every schema actually renders something" guard gets a *paired* test rather than an exemption — one asserting each canvas effect changes the layer underneath it when given one, and one asserting it draws nothing when it isn't.

That leaves **Sketch** as the only remaining effect renderable with what exists today, and what it actually needs is the Effect Assist path editor to trace one with.

## Model groups render

**A group row used to reach nothing at all.** You could create a group, drop effects on it, watch it autosave — and both the house preview and the `.fseq` export filtered their rows to models and sub-models, so every one of those effects was dropped on the floor. No error, no warning, just a prop that stayed dark. Real sequences target groups constantly (37% of one real show's sequenced elements), which makes this whole passages of a show going missing between the screen and the yard.

Groups now render, and with all fourteen of xLights' group render styles — the part the previous pass had recorded as blocked on exactly this.

**Composing.** A group render style decides how several separate props are arranged into the single buffer an effect draws into. The four **Stacked** variants put them side by side or one above the other, plain or scaled so a small prop gets an equal share instead of a sliver. **Horizontal/Vertical Per Model** gives each prop one row; the **Per Model/Strand** pair gives each *strand* one, so a mega tree contributes as many rows as it has strands instead of collapsing to a line. The two **Overlays** set the props on top of each other, centred or scaled. **Single Line as a Pixel** makes each prop one cell, which is how a run of twenty mini-trees is driven as a twenty-pixel string. **Per Preview** keeps them where they physically stand, so an effect sweeps across the yard rather than across a list — and it is what a group's **Default** means, per the manual.

The three **Per Model** styles are a different mechanism, not a variation: they render the effect separately on each prop rather than across all of them. They come back from the planner in the same shape as a composed style, so nothing downstream has to know which kind it got.

**Scattering back.** A group borrows its members' lights the way a sub-model borrows its parent's, so the rendered frame is written back onto real props. Transparent cells are skipped — a model can belong to more than one group, and the second to render would otherwise erase the first. A group sits *under* a model's own rows, which sit under its sub-models': most general to most specific.

**Written once.** The composing, slicing and scattering all live in the engine, where they're under test; the app keeps only the record-to-spec adaptation. The preview and the export reaching different code was the failure mode worth designing against — a show that looks right on screen and plays wrong in the yard is the worst bug this app can have. A test drives a group through both paths over the same frames and requires them to agree.

**Two fixes that came with it.** The Layout page's group style picker was a hardcoded four-option list (`Default / Single Line / Horizontal / Vertical`) — none of them real xLights names — so opening an imported group and saving it rewrote `Horizontal Per Model` as `Horizontal`. It now offers the real names, and a style it doesn't recognise is kept as its own option rather than silently reset. And the popped-out preview window now receives groups in its snapshot; without them it would have had the models but not the memberships, and would have dropped exactly the rows the main window had just learned to draw.

## Morph and Tendrils

Two more effects off `docs/MANUAL-COVERAGE.md`, both of them ones real sequences reach for.

**Morph** is the manual's "movement across a model of one or many strands of lights with a head and a tail" — the sweep people put on arches and mega trees. It interpolates a line from a start line to an end line and fills in the ground it has covered, which is not a liberty: the manual's colour rule, *"three or more colors create progressive morphing sequences across head and tail sections"*, only means anything if there is a swept region for the palette to be spread across. The head is `palette[0]`; the body is the palette *after* it, so a head whose Head Duration has run out actually stops looking like a head instead of staying the same colour. Acceleration, Repeat Count, Repeat Skip, Stagger, Show Head at Start and Swap Start/End are all in, and it is stateless — the swept region is a closed form of the position in the effect, so a scrub costs the same as an export frame.

**Tendrils** is "a twisting threadlike structure": a string dragged across a surface, every segment following the one ahead of it, held back by Friction and pulled straight by Dampening and Tension. It has to be stateful — the whole effect *is* the string's history, and a frame computed from the frame index alone would have no memory of where the string had been, which is the only thing separating a tendril from a moving dot. All seven of the manual's movements are simulated, including the two that follow the music, and the props panel takes its movement list from the effect itself so one can't be implemented and left unofferable. The string is pinned to the model, so the highest Friction setting — the manual's "wild flapping about" — comes back rather than flying off and leaving the effect dark.

Both are tested against the sequential export path as well as the scrubbing one. Tendrils' music test was checked by breaking the audio wiring on purpose and confirming the test failed.

**One correction.** Adjust was listed in the coverage doc as renderable with what the engine already has. Reading its own page shows it isn't: *"used Canvas mode to offset channel values"* — it modifies the layer below it rather than drawing its own, so it belongs with Kaleidoscope and Warp, waiting on a canvas the layer stack doesn't expose. The doc says so now.

That leaves **Sketch** as the only remaining effect renderable with what exists today, and what it actually needs is the Effect Assist path editor to trace one with.

## The Layer Settings panel, finished

**Roto-Zoom** and **Persistent** were the two controls still missing, and the panel is now 6 of 6.

- **Roto-Zoom** turns and scales what an effect drew, about a pivot. Like the transformation before it, it samples backwards from each destination pixel rather than scattering forwards — scattering leaves holes wherever the source grid stretches. Ground the turn uncovers is left transparent rather than smeared, so the layers underneath still show through; a rotation that pushed the effect off its own buffer would otherwise drag the edge pixels across the model.
- **Persistent** is the manual's *"does not clear the display buffer before rendering each frame"*. A stateless effect is a pure function of its frame, so persistence can't be read off one — it has to be produced by actually drawing every frame since the effect started into one buffer. That's what the scrub path does, capped at 600 frames because past that the oldest traces have been painted over anyway and the cost would otherwise grow without bound. The sequential export path already walks frames in order, so there it is just a matter of keeping the buffer instead of replaying into a fresh one. A test drives both paths over the same twenty frames and requires them to agree — two routes to the same picture is exactly the shape of bug that ships a preview which doesn't match the `.fseq`.

Both are wired into the props panel, so they reach every effect. Zoom is stored as a multiplier but edited as a percentage; the pivot sliders only appear once there is a turn or a zoom for them to be about.

That leaves Render Style as the only partial entry in the panel, and for a reason that belongs elsewhere: thirteen of its nineteen styles describe how several models in a *group* are arranged relative to each other, so they wait on group rendering rather than on this panel.


## SubModels

The gap real sequences leaned on hardest. A sub-model is a named subset of a model's nodes — the star on a mega tree, one arch of a set — addressable in the sequencer as its own row. A show that sequences them and is imported without them doesn't merely lose detail: those rows have nowhere to land, so whole passages render on nothing.

- **Imported.** xLights stores them as `<subModel>` elements *nested inside* `<model>`, not as attributes, which is why the lossless raw-attribute bag never carried them. Both kinds are read: node-range sub-models (rows of `1-5,9,12-14`) and sub-buffer ones (a rectangle of the parent's buffer).
- **Resolved to geometry.** The parent's nodes are shared, not copied — a sub-model node keeps its `screenX`/`screenY` so it lights up in the same place in the yard; only the buffer coordinates are rebuilt, because having its own buffer is the whole point of it being a separate row. A descending range like `9-5` reverses the node order rather than being treated as a mistake, which is how a sub-model is made to run the other way along a string.
- **Sequenced.** Sub-model rows appear directly under their parent model. They're keyed by parent id *and* name — several sub-models share one parent id, so matching on the id alone would collapse them into one row and silently merge everyone's effects.
- **Rendered, in both places.** A sub-model borrows its parent's lights, so what it renders is written back onto the parent's nodes, after the parent's own rows. The `.fseq` export does this the same way the preview does — otherwise a show looks right on screen and plays wrong in the yard.

A sub-model that selects no node the parent actually has is dropped rather than kept as an empty row, which would silently swallow every effect put on it.

Still missing: an in-app editor for creating one, and xLights' Draw Model and Generate Slices tools. Losing the ones a show already has was the expensive part.


## Eight more layer blending modes

10 of 24 becomes 18: **1 is Mask**, **2 is Mask**, **1 is Unmask**, **2 is Unmask**, **Shadow 1 on 2**, **Shadow 2 on 1**, **Layered** and **Brightness**.

Worth stating plainly: the manual documents these with screenshots and the advice *"put two effects on a model and step through each of the layering modes to see what they will look like. Experience is much better than reading about it."* It never defines them in words. So these follow what their names unambiguously mean — a mask hides, an unmask reveals, a shadow darkens, Layered picks whichever layer has something to show, Brightness uses one layer as a dimmer over the other. They behave sensibly and consistently; whether each matches xLights pixel for pixel is unverified, and the coverage doc says so.

**Bottom-Top** and **Left-Right** are deliberately absent. They need the pixel's position in the buffer, and the blend function is given only two colours — threading a coordinate through every blend call in the engine for two modes is a change that should wait for a reason bigger than itself.

The props panel now reads its mode list from the engine rather than keeping its own copy, so a mode can't be implemented and left unofferable — which is exactly what had happened to all ten of the originals before they were wired up.


## Three more effects: Music, Fireworks and Tree

35 of 55 becomes 38.

- **Music** — a frequency breakdown of the song, reading the same offline FFT the VU Meter does, so it renders identically in the preview, the popped-out preview and the exported `.fseq`. A live analyser would give a different answer every run and break the determinism the export depends on. All five bar types are implemented from the manual's descriptions (Separate grows from the middle, Collide from the outside in, and so on), plus the logarithmic frequency axis — the manual's own fix for a linear split giving most of the buffer to frequencies music barely uses. Sensitivity both hides quiet bars and *shortens* loud ones, which is what "reduces the effects" means.
- **Fireworks** — explosions of particles, arced over by gravity and fading as they go, optionally fired by the music. Stateless: a particle's whole flight is a closed form of the time since its explosion, so any frame can be computed directly instead of replaying every explosion since the effect started.
- **Tree** — zigzag branches against a coloured background. The colour rule here is the **opposite of every other effect**: "the first color selected will be used as the background color for the model... subsequent color(s) will be used for each branch". So a two-colour palette gives one background and one branch colour, not two branch colours.

Two of the remaining effects turn out to need something the pipeline doesn't have: Kaleidoscope and Warp both modify *the layer below them* rather than drawing their own, and the manual is explicit that Kaleidoscope "is a canvas mode effect. By itself it does nothing." The coverage doc now separates those from the ones that are merely unwritten.


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

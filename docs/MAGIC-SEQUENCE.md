# Magic Sequence

One button in the sequencer: the user has a song on the sequence, presses **Magic Sequence**, and
gets a complete, editable sequence across their own props and groups, timed to the beat, shaped
by the song's sections and energy, coloured for its mood, using the effects real sequencers put
on each kind of prop.

This document is the spec. [MAGIC-SEQUENCE-GOAL.md](MAGIC-SEQUENCE-GOAL.md) is the prompt that
builds it. The evidence behind every default here is in
[`tools/sequence-corpus/`](../tools/sequence-corpus/): an analyzer run over hundreds of
community xLights sequences, and the `priors.json` it produced.

---

## 1. What "good" means

A human-made sequence that people download is not random effects on beats. From the corpus
(section 3) and from two prior attempts at this problem (section 9):

1. **It follows the music at three time scales.** Effects start on beats and bars. Sections change
   the look. Loud parts are brighter and busier than quiet parts, and the number of props lit is
   the main way sequencers show that.
2. **Each prop type has its idioms.** Arches chase, snowflakes take Shockwave hits, windows get
   Marquee, floods hold On, the mega tree and matrix carry the showpiece effects and the most
   layers.
3. **It is restrained.** A small effect vocabulary per song, one or two colours per effect,
   whole-house hits rationed to the moments that earn them, and repetition used on purpose.
4. **It varies.** The same section type repeats its look; neighbouring sections differ; the last
   chorus lifts. Monotony is the failure users notice first (xLightsAI issue #7: "identical effects
   each run").
5. **It is a starting point the user owns.** Every effect is an ordinary effect on an ordinary
   layer, one Ctrl+Z removes the lot, and nothing about it is special afterwards.

The product goal is the fifth point plus enough of the first four that a user's first reaction is
"I can ship this with an hour of edits", not "I have to delete this".

---

## 2. Pipeline

```
 song audio ──► 1. Song analysis ──► SongMap ─┐
                                              ├──► 3. Director ──► ShowPlan ──► 4. Choreographer ──► effects
 layout ──────► 2. Layout reading ──► PropMap ┘        ▲                              ▲
                                                       │                              │
                        user direction + priors.json ──┴──────────────────────────────┘
                                                                                      │
                                                     5. Apply (one undo) ◄────────────┘
                                                     6. Score (render-grounded fit)
```

Everything except the optional Director call runs in the browser, deterministic for a given seed,
so a generated sequence can be reproduced, tested and regenerated.

### 2.1 Song analysis → `SongMap`

```ts
interface SongMap {
  durationMs: number;
  bpm: number;
  beats: number[];               // ms
  downbeats: number[];           // ms, first beat of each bar
  beatsPerBar: number;           // 4 unless detection is confident otherwise
  sections: SongSection[];
  energy: Float32Array;          // per beat, 0..1, song-relative
  hits: { ms: number; strength: number; band: "kick" | "snare" | "hat" | "full" }[];
  impacts: number[];             // ms: sudden energy jumps (>1.8x within 1 s) and drops
  rests: { startMs: number; endMs: number }[];   // where the music stops for half a beat or more (version 2)
  confidence: { beats: number; sections: number };
  source: "browser" | "pro";
}
interface SongSection {
  startMs: number; endMs: number;  // snapped to downbeats, 4- or 8-bar phrases where possible
  label: "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "breakdown" | "solo" | "outro";
  group: string;                   // repeat class: sections with the same group sound alike (A, B, C)
  energy: number;                  // 0..1, mean of the per-beat curve
  rank: number;                    // energy rank among sections, 0 = loudest
}
```

**Browser path (default, free, offline).** Extends what `packages/engine` already has:
`analyzeAudio` (FFT bands), `spectralFlux`, `detectOnsets`.

- **Tempo and beat grid.** Port LightsAutoSequencer's `js/analysis.js` (GPL-3.0, same licence as
  this repo, attribution in the file header and in `LICENSE`/NOTICE): autocorrelation for a
  rough tempo, a circular-concentration fit against the kick for phase, a kick-gap test for
  half/double time, snap to whole BPM when it fits as well. Replace `estimateTempo`'s median gap,
  which is reported only today.
- **Downbeats.** Same source: votes from kick-vs-snare backbeat, chord change, and timbre change.
- **Sections.** Bar-synchronous self-similarity (12-bin chroma + band timbre), Foote novelty,
  boundaries snapped to bars and then to 4-bar phrases, repeats clustered into groups A/B/C.
  Labels by rule: the most-repeated high-energy group is `chorus`; a low-energy first section is
  `intro`; the last section is `outro`; a once-only section after the second chorus is `bridge`.
  Merge sections under 2 bars; cap any single section at 32 bars by splitting at the strongest
  novelty peak (xLightsAI shipped an 89-second "chorus" before adding this).
- **Energy.** Loudness (RMS dB) per beat, smoothed over a bar, normalised to the song's own
  5th..95th percentile. Song-relative on purpose: a quiet carol still has a loudest part.
- **Hits.** Band-limited flux (`detectOnsets` with `band: "low" | "mid" | "high"`) at high
  sensitivity, kept only above the song's 85th-percentile strength.
- **Impacts.** Energy ratio over a 1 s window above 1.8 or below 0.55 (xLightsAI found these in
  22/22 songs, ~12 per song).

Runs in a Web Worker so the page stays responsive (the existing analysis runs on the main thread in
a `setTimeout`, which is fine for a waveform but not for this). Target: under 5 s for a 4-minute
song on a mid laptop.

**Pro path (optional, better).** For users who want tighter beats and real section labels:

- **Beat This!** (CPJKU, ISMIR 2024, code and weights MIT) as ONNX in a Worker, on
  onnxruntime-web's WASM backend. About 25 MB (10.5 MB model, 14 MB runtime), the model kept in
  Cache Storage after first use. Replaces beats and downbeats only; built, see "Pro analysis" in
  the build log.
- Server job (same pattern as `Jobs/AlignLyrics.php`) for section labels from a hosted model
  **only after its weights licence is confirmed** (allin1's Harmonix-derived weights and
  SongFormer's are both unconfirmed today). Until then the browser segmenter is the only one.
- The SongMap is cached on the sequence (`metadata.songMap`, keyed by an audio hash) so analysis
  runs once per song, not once per press.

**Not used, and why.** madmom's weights and MTG/Essentia mood models are CC BY-NC-SA (non-commercial,
ambiguous for a hosted service). LLMs do not produce timings: SongFormer's authors measured
Gemini 2.5 Pro's section boundaries off by up to 2 s. A model that hears the song may *label*
sections; it never *places* them.

### 2.2 Layout reading → `PropMap`

Every model, group and sub-model in the project gets:

```ts
interface PropInfo {
  key: string;                    // "model:12" | "group:3" | "submodel:12/Star"
  role: Role;                     // see below
  tier: "hero" | "feature" | "frame" | "fill";
  nodes: number;
  dims: 1 | 2;                    // a line of lights vs a 2D buffer (tree, matrix, spinner, custom)
  x: number; y: number;           // normalised position in the house, 0..1
  side: "left" | "centre" | "right";
  members?: string[];             // groups
}
```

- **Role** comes from `tools/sequence-corpus/roles.mjs`, ported to `apps/web/src/lib/propRoles.ts`:
  name keywords first (a "Custom" model says nothing; its name says snowflake or singing face),
  then `DisplayAs`, then a group's majority member role (a group is what most of its members are;
  its name only breaks a tie, as LightsAutoSequencer learned with "EVERYTHING BUT STARBURST").
  A dense Custom model (≥150 nodes, ≥45% of its buffer filled) reads as a matrix.
  Roles: `mega_tree, mini_tree, matrix, singing_face, arch, cane, spinner, snowflake, star,
  window, outline, icicle, wreath, bush, flood, present, character, pathway, moving_head,
  whole_house, other`.
- **Tier** decides who carries a section. `hero`: mega tree, matrix, singing faces, and any prop
  whose node count is ≥1.5x the next largest among the top ten (xLightsAI's outlier cut; it once
  promoted 50-pixel stakes to heroes because of a node-count bug, so count nodes from geometry,
  not attributes). `feature`: spinners, stars, snowflakes, arches, canes, mini trees. `frame`:
  outline, windows, icicles. `fill`: floods, bushes, pathway, whole-house groups.
- **Groups.** In the corpus 35% of effects land on groups and 13% on sub-models. Prefer the user's own
  role-homogeneous groups ("All Arches"). For a role with two or more models and no group, the
  dialog offers to create one ("Magic: Arches"), default on; created groups are ordinary groups.
  Without groups, the same effect is placed on each member with identical timing, which renders
  the same as a group with a per-model buffer.
- The user can correct any role in the dialog. Their correction is stored on the model
  (`params.magicRole`) and wins next time.

### 2.3 Director → `ShowPlan`

The plan is per section, never per effect:

```ts
interface ShowPlan {
  seed: number;
  palettes: Record<string, string[]>;      // name -> 2..6 hex colours; effects use 1-2 of them
  sections: {
    index: number;                         // into SongMap.sections
    look: string;                          // which section's look this one reuses ("" = new)
    intensity: number;                     // 0..1: how much of the house is lit, how fast
    palette: string;
    featured: Role[];                      // roles that carry this section
    families: Partial<Record<Role, EffectName[]>>; // allowed effects per role, in preference order
    motion: "left-to-right" | "right-to-left" | "centre-out" | "alternate" | "unison";
    accents: "none" | "downbeats" | "beats" | "hits";
    wholeHouseHit: boolean;                // one unison hit at the section's first downbeat
  }[];
  ending: "fade" | "hit-then-dark" | "hold";
  style?: "show" | "classic";              // how the house moves (11, "The show style"); absent is classic
  avoid?: EffectName[];                    // effects a chat edit took out everywhere ("less strobe")
}
```

Two directors produce the same shape:

- **Rules director (always available).** Intensity from section energy and rank, with a lift for
  the last chorus. Same `group` reuses the same look; neighbours must differ in palette or
  families. Families per role from `priors.json` (`roleLift`, `intensity.byRole`), multiplied by
  the chosen **feel** (section 6.2). Palette from the feel and the song's energy profile.
- **AI director (optional).** One Claude call per press, through the existing provider plumbing in
  `apps/api/app/Services/Shader` (new `MagicPlanController`, `POST /v1/sequences/{id}/magic-plan`).
  Input, as compact JSON: the SongMap summary (sections with label, length in bars, energy, rank,
  repeat group; bpm; hits per section), the PropMap summary (roles with counts and tiers, group
  names), the corpus priors for the roles present, the feel, the user's free-text direction, and
  the song's title and artist when the ID3 tags or filename give them. Output: a `ShowPlan` as
  structured output (`output_config.format` with a JSON schema), added to the driver interface
  alongside today's free-text `complete()`; check the model is in the driver's `ADAPTIVE_THINKING`
  list. Not forced tool use: Claude Opus 5.5 and Sonnet 5.5 return a 400 for `tool_choice`
  `any`/`tool`. Default model `claude-opus-5-5` at effort `medium` (its default), overridable
  with `MAGIC_MODEL`. The server validates every field against the whitelist
  (effect names that exist in `EFFECT_SCHEMAS` and are allowed for that role, hex colours, section
  indices in range) and drops what fails; the client fills any gap from the rules director, so a
  partial or failed AI plan still produces a sequence. Two or three candidate plans may be asked
  for and the one with the best predicted fit score kept.

What the AI is for: knowing that "Carol of the Bells" wants icy blue and white and a driving
pulse, that "Silent Night" wants warm white and almost nothing moving, that a user who typed
"make the tree the star of the chorus" means `featured: ["mega_tree"]`. What it is not for:
beats, boundaries, timestamps, per-effect parameters, anything per frame.

### 2.4 Choreographer → effects

Deterministic, seeded (`mulberry32(seed)`), pure: `(SongMap, PropMap, ShowPlan, priors) → placements`.
Lives in `apps/web/src/lib/magic/choreograph.ts` and is unit-tested without a DOM.

Per section, per role (or per group carrying a role):

1. **Lit or dark.** Heroes are lit for most of the song (corpus: singing faces 97%, matrix 77%,
   mega tree 63%). Every other prop's chance of being lit follows its role's coverage in
   `priors.roles[role].coverage` (10-28%), scaled by the section's intensity, so quiet sections
   run on heroes plus one or two roles and choruses light most of the house. Featured roles are
   always lit. Dark props get nothing, not an Off effect; floods are the exception (Off backdrops
   are 18% of flood time in the corpus).
2. **Effect family.** Pick one family per prop per phrase from `families[role]`, weighted by
   `priors.roles[role].effectShareBySeconds × roleLift^k × feel multiplier`. `k` rises with the
   feel's "character" setting, so the lift column decides more when a user wants a distinctive
   look. At high intensity, multiply by `priors.intensity.highVsLowLift`. Reject anything that
   can't render on that prop: `CANVAS_ONLY_EFFECTS`, `TIMING_TRACK_EFFECTS` without their track,
   and 2D-only effects (Pictures, Text, Video) on `dims: 1`.
3. **Re-trigger, don't switch.** Within the phrase, re-trigger that family at its corpus length
   (`priors.durationBeatsByEffect[effect].p50`, quantised to 1, 2, 4, 8 or 16 beats). Punctual
   effects (On, Shockwave, Ripple, Curtain, SingleStrand) get about 1 beat; textures (Twinkle,
   Snowflakes, VU Meter, Meteors, Wave) get 4-16. Each re-trigger varies direction or colour
   rather than effect: the corpus repeats the same effect next 73-94% of the time, but almost
   never as an identical copy (`style.identicalRepeatRunLength` p90 = 2). The family changes at
   phrase and section boundaries.
   **Grid by tempo:** at 90 BPM and above, starts go on beats (half-beats for accents). Below 90
   BPM they go on bars and phrases; the corpus's slow songs put only 26% of starts on beats.
4. **Coordination.** Props of one role share effect and timing. When four or more props start
   together, the corpus median is 88% starting the same effect. `motion` staggers them:
   left-to-right offsets each prop by one beat in x order, `alternate` splits odd and even, and
   `centre-out` mirrors.
5. **Accents** go on a second layer above the base: short On, Shockwave or Ripple (half to one
   beat) on `accents` events, on hero and frame props. Whole-house hits fire only where
   `wholeHouseHit` is set or an impact lands on a downbeat, and are capped at the corpus p75 of 1.5
   per minute. Most corpus songs have none.
6. **Parameters.** Start from the corpus preset for the effect: `priors.parameterPresets` medians
   and modal choices, converted from xLights keys by the inverse of the `PARAMS` table in
   `xsqEffectSettings.ts`. Then tie cycle counts to tempo. A `*_Cycles` or `Chase_Rotations` value
   becomes `priors.cyclesPerBeat[effect][key].p50 × lengthInBeats` (SingleStrand about 0.8 per
   beat, Bars 0.55, Color Wash 0.4). Speed sliders such as `Spirals_Rotation` keep their preset
   value scaled by the feel's speed. Direction comes from `motion`. Use 1-2 palette colours per
   effect (`priors.palette.sizeByEffect`), from the section palette.
7. **Layers.** Layer 0 is the base and layer 1 holds accents. Heroes may take a third layer for a
   texture (Twinkle or Shimmer at low mix) in high-intensity sections; the corpus median for mega
   trees and matrices is 2 layers, p90 6-7. Blend is Normal. Never put two overlapping effects on
   one layer (the `.xsq` writer refuses that).
8. **Transitions.** Fade-out on about 17% of effects and fade-in on about 11%, plain Fade, placed
   at phrase and section ends. The intro builds in, and the ending follows `plan.ending`.

The output is plain `SequenceEffect`s, so everything downstream (preview, `.fseq`, `.xsq` export,
undo) works unchanged.

### 2.5 Apply

- `store.addEffects(placements)` under one undo entry (already exists for paste).
- Adds timing tracks **Magic Beats**, **Magic Bars**, **Magic Sections** (labelled), marked
  `fixed`, and sets `songBoundaries` from the sections so Song Structure Regions show up.
- Modes: *Fill empty rows* (default for a sequence that already has effects), *Replace
  everything* (asks first, still one undo), *New layers on top*.
- Prop scope: all, or the roles/groups ticked in the dialog.

### 2.6 Score

A render-grounded fit score, adapted from LightsAutoSequencer's `fit.js`, computed headlessly with
the engine's existing renderer (`createRowSequencer` / `exportSequenceToFseq` path, sampled at 4 Hz
with a node stride, each prop weighted equally regardless of node count):

- **loud:** correlation of smoothed house brightness with loudness (target r ≥ 0.6).
- **beat:** visual change just after beats vs mid-beat (target ratio ≥ 2.5).
- **lift:** correlation of section brightness with section energy (target r ≥ 0.7).
- **style:** Jensen-Shannon divergence between the generated effect-by-role distribution and the
  corpus's (target below the corpus's own between-song spread).
- **variety:** distinct looks per distinct section group; no two neighbouring sections identical.

Shown in the dialog as one number with the three bars underneath, and used internally to pick the
best of N candidate seeds or plans.

---

## 3. What the corpus says

**The corpus.** Community Christmas sequences, collected 2026-10-07. After dropping xLights'
auto-backups, exact duplicates, and anything beyond three sequences from any one package (one show
folder alone held 27), the corpus is **357 sequences from 347 packages, with 331,260 effects**. 345
of them shipped with their author's `xlights_rgbeffects.xml`, so element names resolve to model
types. All 357 have timing tracks and 213 have a Beats track. Their tempos run from p10 89 to p90
160 BPM (median 126). 80% are sequenced at 25 ms frames and 18% at 50 ms. They were saved in
xLights 2020-2026, mostly 2022-2025.

Shares are averaged over songs (each song's own mix counts once), not pooled over effects. The
median sequence has 442 effects but the p90 has 2,422, so pooling would let a few dense ones speak
for everyone. All numbers are in `tools/sequence-corpus/priors.json`.

### 3.1 Prop count is the intensity control; heroes carry the song

Share of the song each prop is lit (median over props of that role):

| Role | Lit | Role | Lit | Role | Lit |
|---|---|---|---|---|---|
| singing face | 97% | spinner | 28% | arch | 18% |
| matrix | 77% | star / present | 25% | mini tree | 17% |
| mega tree | 63% | pathway | 21% | cane / flood | 17% |
| icicle | 42% | whole-house group | 20% | outline | 13% |
| wreath / snowflake | 19-20% | | | window | 10% |

At any second, about 30-36% of a song's used props are lit (median). Averaged over songs, the lit
share is 0.40 in the first tenth, holds at about 0.47 through the middle, and drops to 0.36 in the
last tenth. The big swing is phrase to phrase. Within a song, the quietest 16-second stretch lights a median
24% of props and the busiest 52%, about 1.9x (IQR 1.4-3.1x). Moment to moment it is much smaller:
in the 51 songs that carry xLights' "Note Onsets" track, the busiest third of the song by onset
density lights 36% of props against 30% in the quietest third.

**Rule:** the hero props (singing faces, matrix, mega tree) are on for most of the song. Every
other role is dark about four-fifths of the time and comes in to mark sections and peaks.

### 3.2 Which effects go on which props

Effect share by seconds on each role, then **lift** (how much more that role uses the effect than
the corpus does; >1.5 means "belongs here"):

| Role (songs) | Most time on | Highest lift |
|---|---|---|
| arch (219) | SingleStrand 43%, VU Meter 8, On 5, Color Wash 5 | SingleStrand 3.6, Life 1.9, Ripple 1.9, Morph 1.7 |
| mega tree (241) | Spirals 11, On 9, SingleStrand 8, Twinkle 7, Pinwheel 6, Pictures 5 | Tree 3.7, Snowstorm 3.2, Fireworks 3.1, Pictures 2.8, Lightning 2.8 |
| matrix (218) | Text 24, Video 11, On 9, Pictures 8, Marquee 5, Faces 4 | Text 9.5, Video 5.6, Pictures 5.0, Lightning 4.0, Marquee 2.8 |
| singing face (169) | Faces 52, On 20, SingleStrand 5 | Faces 6.3, Shimmer 3.0 |
| mini tree (258) | On 14, SingleStrand 14, Spirals 8, VU Meter 7, Twinkle 5 | Tree 3.8, Curtain 2.7, Wave 2.2, Morph 2.1, Spirals 1.9 |
| snowflake (229) | SingleStrand 15, On 15, Pinwheel 11, Shockwave 9, Ripple 6 | Shimmer 2.9, Fan 2.8, Ripple 2.7, Shockwave 2.7, Shape 2.6 |
| star (181) | On 18, SingleStrand 11, Pinwheel 9, VU Meter 8, Shockwave 7, Fan 6 | Shimmer 4.3, Snowstorm 4.1, Fan 3.8, Galaxy 3.1 |
| spinner (118) | SingleStrand 22, Pinwheel 12, VU Meter 9, On 9, Shockwave 6 | Galaxy 3.2, Ripple 2.7, Pinwheel 2.5, Shimmer 2.5 |
| cane (132) | SingleStrand 16, Spirals 13, VU Meter 12, On 11, Bars 6 | Spirals 2.8, VU Meter 2.5, Lightning 2.3 |
| window (200) | SingleStrand 25, On 15, VU Meter 8, Marquee 6 | Marquee 3.6, Morph 2.3, SingleStrand 2.1 |
| outline (250) | SingleStrand 24, On 18, VU Meter 8, Color Wash 6, Bars 5 | Plasma 2.7, Garlands 2.5, Morph 2.1, Bars 2.0 |
| icicle (64) | SingleStrand 20, On 12, Twinkle 11, VU Meter 10, Spirals 7, Wave 6 | Wave 3.3, Twinkle 2.7, Meteors 2.4, Garlands 2.3 |
| wreath (119) | SingleStrand 22, On 16, Faces 11, Pinwheel 9 | Fan 2.5, Pinwheel 1.8, Ripple 1.7 |
| pathway (95) | SingleStrand 23, VU Meter 9, On 8, Wave 6, Bars 6, Curtain 5 | Curtain 4.2, Wave 3.5, Fill 2.6, Bars 2.3 |
| bush (60) | Twinkle 25, On 23, SingleStrand 14 | Twinkle 6.4, Curtain 2.6 |
| flood (88) | On 42, Off 18, Color Wash 11, VU Meter 10 | Off 6.7, Color Wash 2.9, On 2.6 |
| whole-house group (269) | On 14, Twinkle 9, Snowflakes 8, SingleStrand 8, Shockwave 6 | Snowflakes 4.3, Shader 3.6, Garlands 2.8, Butterfly 2.5, Twinkle 2.3 |
| character (66) | On 26, SingleStrand 13, Twinkle 10, State 8 | State 5.3, Twinkle 2.6, Bars 2.6 |

Read it as two layers of advice. The "most time" column is the safe default: line props chase
(SingleStrand), everything takes On pulses, and VU Meter is the common audio-reactive filler
(about 8% of time on most line props). The "lift" column is the character: Text, Video and Pictures
belong on the matrix; Spirals belong on canes and trees; Marquee belongs on windows; Twinkle belongs
on bushes; Snowflakes, Garlands and Shader work as a whole-house texture.

Targets: 51% of effects are on single models, 35% on groups, 13% on sub-models.

### 3.3 Timing

- **Effects are short and land on the beat.** Median length in beats: On 1.0, Shockwave 1.0,
  Ripple 1.0, Curtain 1.0, SingleStrand 1.1, Color Wash 1.0, Morph 2, Bars 2, Spirals 2.8,
  Pinwheel 3.1, Fan 3.9, Meteors 4.0, Wave 4.1, Snowflakes 8, Twinkle 8.8, VU Meter 14.8.
  Punctual effects mark beats; textures (Twinkle, Snowflakes, VU Meter, Meteors, Wave) run for
  phrases.
- **Alignment depends on the song.** In the 213 songs with a Beats track, 54% of effect starts sit
  on a beat mark, 13% on a half-beat, and 11% on a bar line. Per song, the median is 45%, with an
  IQR of 26-72%. Below 90 BPM the median is 26%; at 90 BPM and above it is about 50%. Slow songs
  are phrased by lyric and bar, not by beat. Across all timing tracks, 72% of starts sit on some
  timing mark.
- **Onsets are not the clock.** The per-song correlation between onsets per second and effect
  starts per second has a median of 0.09. Sequencers follow the beat grid and the song's
  structure, not every transient.
- **Tempo coupling for speed parameters** (median cycles per beat): SingleStrand 0.8 chase
  rotations per beat, Bars 0.55, Color Wash 0.39, Fire growth 0.41, Garlands 3.75. Shockwave and
  Ripple run 1 cycle per effect, and an effect usually lasts 1 beat.
- Effect length barely changes with tempo (median 1.0 beat at 100-130 BPM, 1.8 at 130+ BPM). At
  fast tempos, sequencers hold effects across beats instead of chasing every one.

### 3.4 Restraint and repetition

- **Small vocabulary.** The median song's single most-used effect is 41% of its placements, and 6
  effects (IQR 4-9) cover 90% of them.
- **Same effect, new settings.** On the same prop and layer, the next effect is the same effect
  73-94% of the time (On 94%, SingleStrand 92%, Shockwave 93%, Spirals 84%, Bars 74%, Pinwheel 73%).
  It is rarely an identical copy: the p90 run of identical effect + palette + settings is 2. So the
  rhythm comes from re-triggering one effect family per phrase and varying direction and colour
  on each beat, not from switching effects.
- **Unison.** When four or more props start an effect at the same moment, the median share using
  the same effect is 88%.
- **Whole-house hits are rare.** Moments where 40% or more of the house starts together happen a
  median of 0 times per minute (p75 1.5, p90 4.5). They come mostly from SingleStrand, Spirals and
  Shockwave.
- **About 5 distinct effects play at once** across the house (median, IQR 3-7).
- **Density.** 179 effects per minute is the median (IQR 79-405). The median sequence uses 28 rows.

### 3.5 Colour

- One colour per effect 49% of the time, two 32%, three 11%.
- About 9 distinct colours per song (median, IQR 6-18).
- The most used colours: white 22%, red 16%, green 10%, blue 8%, yellow 5%, cyan 5%, black 4%, and
  magenta 4%. Warm whites and greens follow.
- Colour curves appear in under 2% of palettes.

### 3.6 Layers, blends, transitions, value curves

- 66% of props use one layer; 15% use two. Mega trees and matrices have a median of 2 layers
  (p90 6-7); spinners and characters reach 6 at p90.
- Blend is Normal 93% of the time. "2 is Unmask" and "Layered" are the next most common, at 1-2%
  each.
- Fades: 11% of effects fade in and 17% fade out, plain Fade about 90% of the time. Wipe and
  Circle Explode are the only other transitions with more than 2%.
- Value curves are rare (under 20% for most effects). The exceptions are Circles (64%) and Fill
  (72%), where the curve *is* the effect, and Moving Head (41%).
- Buffer style is Default for 57-92% depending on the effect; "Per Preview" (10-16% on Shockwave and
  Pinwheel) is how a hit sweeps across a whole group.

### 3.7 What this changes in the design

1. Light props by **tier and section**, not by beat: heroes most of the song, everything else
   about 20%, more in choruses (2.4 step 1).
2. Hold **one effect family per prop per phrase** and re-trigger it on beats with varied
   direction/colour (2.4 step 3). This is the corpus's main rhythm device, and it is what
   prevents the "random, too blinky" Instant Sequence failure.
3. **Grid by tempo**: beats at 90 BPM and above, bars and phrases below.
4. **Punctual effects are 1 beat; textures are 4-16 beats.** Use the per-effect duration table,
   not one global length.
5. **Palette of 1-2 colours per effect**, 6-12 per song, drawn from the feel.
6. **Unison per role**, whole-house hits rationed to section starts.
7. **Layers only on heroes.** A base plus at most one accent layer elsewhere.
8. **VU Meter** is a legitimate filler the corpus uses on line props; the engine already has it.

---

## 4. UI

Follows `DESIGN.md`: dark chrome, the accent only for the current/primary thing.

- **Entry.** A **Magic Sequence** button in the sequencer toolbar's command group (beside the
  Sequence menu, `SequencerPage.vue` ~:2762), a ⌘K command, and an item in the Sequence menu.
  Disabled with a tooltip when the sequence has no audio.
- **Dialog** (`ModalPanel`, wide):
  1. *Song*: analysis status, bpm, a strip of detected sections (labels editable, boundaries
     draggable later), "Use pro analysis" when available.
  2. *Feel*: From the song (default), Traditional, Joyful, Peaceful, Powerful, Magical, Rock/EDM,
     plus a free-text "Direction" box when the AI director is on.
  3. *Colours*: From the feel (default), or any saved palette.
  4. *Props*: role chips with counts (tap to exclude), "Fix roles…" for corrections, "Create
     groups for roles without one" toggle.
  5. *Mode*: Fill empty rows / Replace everything / New layers on top.
  6. *Style*: Whole-house show (default) or Prop by prop (11, "The show style").
  7. **Generate** (primary). Then: fit score, "Try another" (new seed, same plan), "Undo", and a
     *Change it* box for chat edits.
  8. When the last press has since been edited: *Share what you changed* (11, "Phase 5").
- Progress is honest: "Finding beats… Finding sections… Asking the director… Placing 1,842 effects".
- Works with the AI director off; the toggle shows only when a provider is configured or the user
  has their own key (same rules as the shader assistant).

---

## 5. What has to change in the existing code first

1. **xLights settings → engine params.** `packages/formats/src/xsq.ts` translates settings for only
   5 effects; everything else imports with defaults. Write `importEffectSettings(name, raw)` as
   the inverse of `exportEffectSettings` in `apps/web/src/lib/xsqEffectSettings.ts` (the `PARAMS`
   table already holds keys, scales and choices). Magic Sequence needs it to turn corpus presets
   into engine params; `.xsq` import gets real settings as a side effect.
2. **Layer order.** The `.xsq` reader treats the first `<EffectLayer>` as the bottom; the writer
   (correctly) treats it as the top. Import-then-export flips layers. Fix before generating
   multi-layer sequences (tracked as its own task).
3. **Analysis off the main thread.** Move `analyzeAudio` and the new beat/section code into a
   Worker.
4. **Perf test.** `packages/engine/test/perf.test.ts` uses `name: "ColorWash"`, which matches no
   effect, so that layer renders nothing and the benchmark undercounts. Fix while adding a
   generated-sequence render benchmark.
5. **CLAUDE.md** says the engine has a worker pool and SharedArrayBuffer frame store; it doesn't
   yet. Correct the line or build it; Magic Sequence only needs the analysis Worker.

---

## 6. Data and "training"

### 6.1 What was learned, and how

`tools/sequence-corpus/analyze.mjs` reads every sequence in a local corpus folder (never
committed: the sequences are their authors' work, shared for personal use) and writes
`tools/sequence-corpus/priors.json` (committed: aggregate statistics only, no sequence can be
reconstructed from it). The app imports `priors.json` at build time.

There is no neural network in v1, deliberately:

- Free sequences ship **without their audio** (copyright), so there are no (audio, sequence)
  pairs to train a generative model on. What the sequences do carry is their timing tracks: all
  357 have some, 213 have a Beats track and 51 have xLights' own "Note Onsets" track, all computed
  from the audio. That is enough to learn how sequencers respond to tempo and to musical busyness
  (section 3), and those conditional statistics are the "trained model".
- A few hundred songs is a small dataset; tables of conditional frequencies with sensible
  smoothing beat a learned model at this size, are explainable, and can't hallucinate an
  effect that doesn't exist.

### 6.2 Feels

Multipliers over the corpus priors, in `apps/web/src/lib/magic/feels.ts`:

| Feel | Favours | Avoids | Speed | Intensity shift |
|---|---|---|---|---|
| Traditional | On, Color Wash, Twinkle, SingleStrand | Strobe, Plasma, Lightning | 0.8 | −0.1 |
| Joyful | SingleStrand, Bars, Marquee, Twinkle | Fire, Lightning | 1.0 | +0.05 |
| Peaceful | Color Wash, Twinkle, Snowflakes, On (dim) | Shockwave, Strobe, Bars | 0.6 | −0.25 |
| Powerful | Shockwave, Bars, SingleStrand, Strobe | Twinkle, Color Wash | 1.4 | +0.25 |
| Magical | Twinkle, Butterfly, Spirals, Galaxy, Shimmer | Strobe, Bars | 0.8 | 0 |
| Rock/EDM | Shockwave, Strobe, VU Meter, Lightning, Bars | Twinkle, Candle | 1.5 | +0.3 |

Starting values; tune against the fit score and Logan's eye.

### 6.3 Later (not v1)

- **Paired data.** Let users opt in to share (SongMap features, generated plan, their edits)
  after they edit a Magic Sequence: features only, never audio. Their edits are labels: what a
  human changed is what the generator got wrong. That is the dataset a learned model needs.
- **Learned effect picker.** Gradient-boosted or small transformer over (role, section label,
  energy, bpm, position) → effect family, once paired data exists.
- **Vocals.** Demucs (MIT) vocals stem + word timing for singing faces and "follow the voice"
  dimming. LightsAutoSequencer already runs demucs-web and Whisper in the browser; port when faces
  are in scope. The server lyric aligner (`Jobs/AlignLyrics.php`) already exists for words.
- **Chat edits.** "Make the second chorus bigger", "less strobe" as tool calls against the
  sequence, the thing forum users actually asked for.

---

## 7. Models and services

| Need | v1 | Where | Licence | Cost |
|---|---|---|---|---|
| Beats, bars, tempo | Port of LightsAutoSequencer analysis | Browser worker | GPL-3.0 | 0 |
| Better beats (opt-in) | Beat This! ONNX (small0) | Browser worker, WASM | MIT | 0 (25 MB one-time download) |
| Sections + labels | Own self-similarity segmenter + rules | Browser worker | ours | 0 |
| Energy, hits, impacts | Own DSP on existing FFT | Browser worker | ours | 0 |
| Creative plan | Claude Opus 5.5 (`MAGIC_MODEL` to change) via existing provider plumbing | API | API terms | ~10-15 cents per press on Opus 5.5 ($4/$20 per MTok; ~6k in, ~2k out plus thinking); ~5-8 cents on Sonnet 5.5; under 1 cent on Haiku 5.5 |
| Vocals / words (later) | Demucs + Whisper/WhisperX | Browser or GPU worker | MIT / BSD-2 | estimated 1-3 cents per song hosted |
| Section labels from audio (later) | SongFormer / allin1 | Hosted GPU | weights unconfirmed | estimated 7-12 cents per song |

The AI director reuses `SHADER_PROVIDER` / `SHADER_API_KEY` / `ANTHROPIC_API_KEY` and the same
credit ledger, with its own caps: `MAGIC_DAILY_LIMIT`, `MAGIC_MONTHLY_LIMIT`, route throttle
`throttle:10,1`, bring-your-own-key headers honoured like the shader assistant's.

---

## 8. Access and decisions needed

| Item | Status | Needed for |
|---|---|---|
| Anthropic key in production | Already set for the shader assistant | AI director |
| Credits for the AI director | Decided: same ledger as the shader assistant, separate caps | AI director caps |
| GPU host (Modal or Replicate) | Not needed for v1 | Vocals, pro section labels |
| Public-domain test songs | Fetched by the goal run (Musopen/Wikimedia Commons carols) | Evaluation |

---

## 9. Prior art and what it taught

- **xLightsAI** (derwin12/xlights-autosequencer, MIT, Python, Docker, active Oct 2026). 36
  analysis algorithms, Demucs stems, 8-tier "power groups", 28 themes, 212 variants, no LLM in
  generation. Lessons: segmentation and variety are the hard parts, not beat detection; 5 of 8
  tiers never fired and the hero tier took 89% of placements; settings locked per song made songs
  "look the same"; density culling left whole sections dark. Its reference-sequence study (5
  songs) agrees with ours (357) on the big points: a small vocabulary, prop count as the intensity
  control, and layers concentrated on big props. Its "white motion effect coloured by an On layer
  set to *2 is Unmask*" idiom is one vendor's habit; across our corpus that blend is 1.3% of
  effects.
- **LightsAutoSequencer** (computergeek1507, GPL-3.0, browser JS, active Oct 2026). Beats,
  downbeats, sections, drum hits, demucs-web vocals, Whisper words, a per-section plan the user
  fills in, an "Ideas" randomiser weighted by one owner's 44 sequences, and a render-grounded fit
  score. Same licence as this repo: the analysis code is portable with attribution.
- **xlights-sequence-generator** (hislopkent, no licence, Python). Claude as an optional "AI
  Director" emitting a section/cue plan via forced tool use, validated against a whitelist,
  falling back to a deterministic planner. The same split as section 2.3, but it lets the model
  emit cue times; this spec doesn't.
- **Light-O-Rama Instant Sequence.** Forum consensus for a decade: random, not beat-linked, "too
  blinky", every song looks the same. The anti-pattern this spec is written against.
- **xLights itself** (2026.17): no auto-sequencer; has HTDemucs stems and an MCP server, which a
  later "chat edits" feature could also target.

---

## 10. Phases

| Phase | Ships | Done when |
|---|---|---|
| 0. Groundwork | `importEffectSettings`, layer-order fix, `propRoles.ts`, `priors.json` in the app | Real `.xsq` imports with settings; round-trip test passes |
| 1. Analysis | Worker with beats, downbeats, sections, energy, hits; SongMap cache | Synthetic-audio tests pass; public-domain carols give sane sections |
| 2. Rules generator | Choreographer, rules director, feels, dialog, apply, timing tracks, regions | Button works end to end with no network; fit score ≥ 60 on the test songs |
| 3. AI director | Endpoint, schema, validation, caps, fallback | Same flow with the toggle on; invalid plans degrade gracefully |
| 4. Score and tune | Headless fit score, candidate selection, tuning pass | Generated stats inside corpus spread; Logan signs off on 3 songs |
| 5. Later | Vocals, chat edits, learned picker | Built 2026-10-09 (11, "Phase 5"); the picker learns once shared edits arrive |

---

## 11. Build log

What was built, and where the code made a decision the spec didn't.

### Phase 0: groundwork

- `.xsq` settings translation lives in one place now. `packages/formats` returns each effect's raw
  settings and palette strings (`rawSettings`, `rawPalette`); `importEffectSettings` in
  `apps/web/src/lib/xsqEffectSettings.ts` turns them into engine params, palette, blending,
  fades and layer settings, driven by the same `PARAMS` table as the export. The old five-effect
  mapper in `formats` is gone, so there is no second table to drift.
- The reader numbers the first `<EffectLayer>` as the top layer. Import-then-export is a round
  trip (tested).
- `propRoles.ts`: roles as in 2.2. Groups take the majority role of their members; with no
  majority the name decides, and a mix of three or more roles with no name is `whole_house`. The
  node-count outlier cut promotes at most the top three props. Sub-models get their own role from
  their name, else their parent's, and are never heroes.
- `priors.json` is imported by `apps/web/src/lib/magic/priors.ts`; the Docker web stage copies it
  in, and `.dockerignore` keeps `.corpus/` out of the build context.
- The effect whitelist per role (`apps/web/src/lib/magic/roleEffects.ts`): effects with at least
  1.5% of a role's seconds or a lift of 1.5, minus effects that need a file, drawing or timing
  track, Off everywhere but floods, Text everywhere but the matrix, and nothing on moving heads.
  The API validates against a baked copy, `apps/api/database/data/magic-role-effects.json`; a test
  fails when they differ.
- `apps/web/test/fixtures/magic-layout.json` (32 models of real xLights types covering every role,
  five groups) was made here rather than in phase 2, because the role tests need it.

### Phase 1: song analysis

- `analyzeSong(samples, sampleRate)` in `packages/engine/src/songAnalysis.ts` returns the SongMap
  of 2.1 (plus `version: 1`; `energy` is a plain array so the map is JSON-safe). The port of
  LightsAutoSequencer's `analysis.js` is in `packages/engine/src/song/` with attribution in each
  file and in `NOTICE`. It uses the engine's `fftInPlace` and its own 1024-point frames at
  22.05 kHz (a box-filter resampler, since a worker has no `OfflineAudioContext`); the existing
  `onsets.ts` works on 16 coarse bands at the sequence frame rate and can't tell a kick from a
  snare, so it isn't reused here.
- Departures from the reference, each from a synthetic track it got wrong: the grid is fitted to
  the kicks first when there are at least 24 strong ones (eighth-note hats otherwise cancel them
  out); the kick envelope joins the rough-tempo autocorrelation; the half/double-time decision is
  made from the rough tempo before the fit. A true 185-200 BPM track still reads as half time.
- Meter: 3 or 4 beats per bar, 3 only when chord changes stack clearly harder on one beat of three.
- Sections: a boundary must stand a standard deviation above mean novelty; merge under 2 bars,
  split over 32, snap to bars then 4-bar phrases. Labels: the loudest repeated group (energy at
  least 0.5) is `chorus`, the most repeated quieter group is `verse`, a once-only section after
  the second chorus is `bridge`, leftovers are `verse` before the first chorus and `bridge` or
  `solo` after it.
- Impacts use a window of the whole number of beats nearest 1 s: a fixed 1 s window read a
  steady drum loop as dozens of jumps.
- The analysis runs in `apps/web/src/lib/magic/songAnalysis.worker.ts`. The SongMap is cached in
  `metadata.songMap = { hash, map }`, keyed by the SHA-256 of the audio file.
- Measured on synthetic audio in vitest: 90/120/150 BPM within 1 BPM with beat F >= 0.95 at
  70 ms; A-B-A-B-C-B boundaries within a bar with the right groups and the B group as chorus; a
  4-minute song in about 0.9 s. Real recordings are checked in phase 4.

### Phase 2: rules generator and UI

- `apps/web/src/lib/magic/`: `feels.ts`, `director.ts` (rules director and `completePlan`, which
  fills an AI plan's gaps field by field), `choreograph.ts` (pure, seeded), `apply.ts`, `plan.ts`.
  The dialog is `components/MagicSequenceDialog.vue`, opened from the toolbar's Magic button, the
  Sequence menu and the command palette, and disabled until the song is loaded.
- **Who carries a role.** A user's group whose members are at least 75% that role carries it as
  one row (it renders as the same effect on each member); other props of the role are their own
  rows. Whole-house groups carry a background texture in busy sections only: a group is the base
  under every member's own effects (`applyGroupBase`), so a whole-house effect in a quiet section
  would light the whole house. Sub-models are not sequenced yet.
- **Lit or dark** is decided per look (repeat group), not per phrase: a role is lit for the whole
  section, from the heroes up to a target share of rows that runs from 0.6x the corpus's
  quietest-phrase median to its busiest-phrase median as intensity goes from 0 to 1. Roles that
  sat out earlier looks move up the order, so every role gets sections. The feel scales section
  intensity rather than shifting it, so a loud feel keeps its quiet sections quiet.
- **Re-trigger rate.** Punctual effects fill to the next trigger. A role carrying a section
  (featured, not a hero) triggers every 1-2 beats when loud; everything else every 4 or 8 beats;
  heroes a bar or two apart; doubled above 130 BPM. That puts the effect rate inside the corpus's
  IQR (about 170, 310 and 330 a minute at 80, 120 and 150 BPM on the test layout); triggering
  every lit prop on every beat gave 915.
- **Big hits.** Any moment where 40% of rows would start together and the plan didn't ask for a
  hit is thinned: the lowest-tier rows hold their previous effect across that beat instead.
- **Singing faces** lead with VU Meter: Faces needs a lyric track the generator can't make.
- **Style threshold.** `analyze.mjs` now records `style.roleEffectJsd`: per song, the
  seconds-weighted Jensen-Shannon divergence of its effect-by-role mix from the corpus's, over each
  role's top effects minus those Magic Sequence never places (and, later, Pictures and Shader,
  which it places by its own rule). Corpus median 0.456 (IQR
  0.378-0.541). Generated, over 3 tempos x 5 seeds on the test layout: mean 0.386.
- Built after phase 4 (see "Finishing" below): the hero texture layer, Off backdrops on floods and
  sub-model rows. The section strip's labels are editable; dragging its boundaries is the spec's
  "later" and is not built.

### Phase 3: AI director

- `POST /v1/sequences/{sequence}/magic-plan` (`MagicPlanController`, `Services/Magic/`): editor
  access, `throttle:10,1`, the shader assistant's bring-your-own-key headers, and its own caps on
  the credit ledger (reasons `magic_plan` and `magic_plan_refund`, so a plan never uses up a
  shader generation or the other way round). `GET /v1/magic/status` tells the dialog whether to
  offer the director and how much of the allowance is left.
- Defaults: `MAGIC_MODEL` unset means `claude-opus-5-5` on Anthropic (not `SHADER_MODEL`), effort
  `medium`, adaptive thinking; `MAGIC_DAILY_LIMIT` 10 and `MAGIC_MONTHLY_LIMIT` 100 plans per
  person (raised from 20 on 2026-10-09, matching the shader assistant). A plan costs about 10-15
  cents on Opus 5.5, so the worst case is about $12-15 per active person a month; Try another reuses the
  plan and costs nothing.
- Structured output is `output_config.format` with a strict JSON schema, added to the driver
  interface as `completeJson`. Records (palettes, families) travel as lists, because strict mode
  can't express arbitrary keys, and are turned back into records by `PlanValidator::fromWire`.
  A refusal, a cut-off reply or bad JSON is a 502 and a refund.
- `PlanValidator` checks every field against `magic-role-effects.json`, hex colours, section
  indices and the enums, keeps what passes and lists what it dropped. The client re-checks
  against the roles in the layout and fills every gap from the rules plan (`completePlan`), so a
  partial plan still gives a full sequence.
- The direction goes through `RequestScreen::refusalForDirection`: the shader screen refused
  ordinary show talk ("forget the previous section", "the Christmas program").
- In the dialog, any failure falls back to the rules director with one line ("The built-in
  director planned this one."), quoting the server for a cap or a refused direction.
- The server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)
  was added after phase 4 (see "Finishing"). Asking for two or three candidate plans, which 2.3
  leaves optional, is not built: it would double or triple the cost of a press.

### Phase 4: score and tune

- `apps/web/src/lib/magic/score.ts` renders the house through `createHouseRenderer`, the
  per-frame composition now shared with the `.fseq` export (groups, strands and sub-models
  included), at 4 Hz with an 8-node stride, each prop weighted equally. Parts and weights: loud
  0.3 (r >= 0.6 scores 1), beat 0.3 (after-beat over mid-beat change, ratio >= 2.5 scores 1), lift
  0.2 (section r >= 0.7 scores 1), style 0.1 (the corpus's per-song JSD IQR maps 0.541 -> 0 and
  0.378 -> 1), variety 0.1 (looks per repeat group, minus neighbours alike). Floors: loud 0.4,
  beat 0.4, lift 0.5, style 0.3, variety 0.5. A flat all-on Color Wash scores 21; generated
  sequences on the synthetic songs score 76-99.
- **Candidate selection.** The dialog scores three arrangements of the plan (seeds) and keeps the
  best that clears every floor, else the best; it stops early past 6 s on a big house. Try another
  scores one more. Scoring takes about 1 s per candidate on the 32-prop test layout.
- **Test songs** (`tools/sequence-corpus/test-songs.md`, fetched by `fetch-test-songs.mjs`, not
  in git). Best of three seeds on `magic-layout.json`, every part above its floor:

  | Song | Analysed | Score | loud | beat | lift | style | variety |
  |---|---|---|---|---|---|---|---|
  | Jingle Bells (upbeat) | 158.8 BPM, 6 sections | 89 | 0.64 | 1.00 | 1.00 | 0.98 | 1.00 |
  | Silent Night (slow) | 86.9 BPM, 7 sections | 77 | 0.54 | 0.82 | 0.82 | 1.00 | 1.00 |
  | Carol of the Bells (dramatic) | 87.9 BPM, 8 sections | 76 | 0.48 | 0.72 | 1.00 | 1.00 | 1.00 |

- **Tuning that got there.** (1) A punctual effect on a non-hero prop lasts at most two beats (a
  bar on the slow songs' bar grid) and leaves the rest of its slot dark; filling the slot kept
  chases moving through mid-beat, and the beat part sat under its floor (synthetic 120 BPM ratio
  1.54 -> 1.76; Silent Night 1.58 -> 2.22 on its best seed). (2) The heroes' downbeat accents fire
  every bar whenever accents are on. (3) Selection prefers candidates that clear every floor.
- **Two engine bugs found by scoring a real layout**, both fixed with tests: a Per Preview buffer
  whose members share a height (two floods) was over a billion cells wide and stalled every frame
  (preview and `.fseq` export too); and an empty sub-model row, stored by the API as null, crashed
  `parseNodeRanges`.
- **Real app.** A real community layout from the local corpus (32 models, 36 groups, 430
  sub-models; not committed) with the Jingle Bells recording: 630-663 effects, fit 70-74. The
  layout's own role groups (Roofline, Windows, Arches, Candy Canes, Mega Tree and Star) carry
  their roles. Screenshots: `docs/magic-sequence/`.
- Not done: a separate render benchmark beyond the timings the score test logs, the fit score for
  the AI director's candidate plans, and anything in phase 5. (The Beat This! pro analysis came
  later; see "Pro analysis" below.)

### Finishing: the details phases 2 and 3 deferred

- **Sub-model rows.** A sub-model that is a prop of its own carries its role on its own row: a
  star or a singing face on a prop of another role (the star on a mega tree, a face on a singing
  tree). Every other sub-model is treated as a part and left to its parent. Wider than that, part
  names misread as roles: on a real layout with 430 sub-models, a flake's "Circle 1" became a
  wreath and a spinner's "Burst 2" another spinner, and 650 effects became 3,971. Sub-model rows
  render over their parent, as sub-models do everywhere.
- **Hero texture layer** (2.4 step 7). In sections at intensity 0.75 and up, the heroes with a 2D
  buffer take a third layer: Twinkle or Shimmer, whichever the role allows, at mix 0.6 (40%
  opacity over Normal blend), one per phrase.
- **Off backdrops on floods** (2.4 step 1). While a whole-house group plays a background, floods
  that are dark in that section hold Off, so the group doesn't show through them.
- **Refusal fallback** on the AI director's Anthropic call for the models that take it (Fable 5.1,
  Opus 5.5, Opus 5, Sonnet 5.5): a policy decline is retried server-side on the model's default
  fallback inside the same call. Tested against the real SDK with a mocked transport, including a
  reply that carries a `fallback` block.
- Fit scores after these changes (best of three seeds): Jingle Bells 89, Silent Night 77, Carol
  of the Bells 76, unchanged within a point. On the real layout with Jingle Bells: 640 effects
  (289 a minute), fit 76, 19 texture-layer effects on the heroes.

### Pro analysis: Beat This!

`MAGIC-SEQUENCE-GOAL.md` left Beat This! out of the goal; Logan asked for it to be built on
2026-10-08.

- **Model.** The official small0 checkpoint (2M parameters), exported to ONNX with a dynamic time
  axis by `tools/beat-this/export_onnx.py`, committed at `apps/web/public/models/` with its MIT
  notice beside it. ONNX Runtime matches PyTorch within 1e-3 on the logits at every length tried.
- **Port.** The log-mel front end (torchaudio's settings: 22.05 kHz, 1024-point periodic Hann,
  hop 441, 128 slaney mels from 30 Hz to 11 kHz, log1p(1000x)), the 30 s chunking with 6-frame
  borders and keep-first overlap, and the "minimal" peak picker are TypeScript in
  `packages/engine/src/song/beatThis.ts`. Against the Python pipeline on a synthetic signal: the
  log-mel within 5e-5, the logits through onnxruntime-web within 8e-5, and the same 81 beats and
  downbeats exactly. The DBN postprocessor is not ported (madmom's weights are non-commercial).
- **Runtime.** onnxruntime-web 1.30 on WASM, threaded (the page is cross-origin isolated), loaded
  by the analysis worker only when someone presses "Use pro analysis". WebGPU was not used: its
  build of the runtime is 28 MB instead of 14, and WASM is already fast enough. The CSP gains
  `'wasm-unsafe-eval'` for it (recorded in CLAUDE.md).
- **Speed.** Jingle Bells (2:13) in the production image: 9.4 s with the model cached, about
  0.7 s per 30 s chunk plus 5 s of model start and log-mel; about 15 s more the first time,
  for the download. The browser analysis takes 0.6 s.
- **Making it a lighting grid.** Above 200 BPM the tracked beat is a subdivision (Carol of the
  Bells comes back as a 3/4 at 250): an even bar keeps every other beat, an odd bar makes its
  downbeats the beats. Beat This! marks only the beats it is sure of (Jingle Bells' loose ending
  has none after 110 s), so the grid is carried on at the local tempo to the ends of the audible
  song, and the bar pattern past the tracker's last downbeat. Sections are then found on the pro
  bars by the same segmenter.
- **What it measured.** Onset alignment (strong onsets within 40 ms of a beat) improves on all
  three test songs: 0.59 against 0.51, 0.23 against 0.18, 0.24 against 0.20. The fit score does
  not move on average. Best of three seeds, pro against browser: Jingle Bells 75 against 89,
  Silent Night 88 against 77, Carol of the Bells 79 against 76; the real layout with Jingle Bells
  66 against 76. The differences come mostly from where the sections fall (loud and lift), not
  the beat part. Finding sections on the browser's bars and snapping them to the pro downbeats
  was tried and scored lower on all three (87, 72, 71). So pro stays opt-in: it gives a truer
  Magic Beats timing track on a song whose tempo drifts, and is not a better generator by the
  score. "Use browser analysis" switches back, and a song where Beat This! finds fewer than 8
  beats keeps the browser's. Screenshot: `docs/magic-sequence/pro-analysis.jpg`.

### A colour plan, fades, shaders and pictures

Logan asked on 2026-10-08 for colours that look planned rather than random, fades used where they
belong, the library's shaders where they fit, and generated, animated pictures on matrices.

- **Colour plan.** Each placement used to take `palette[(trigger + colour + prop) % n]`, so every
  re-trigger and every prop of a role changed colour. Now a look has a plan (`colourPlan` in
  `choreograph.ts`): heroes and fills lead in the palette's first colour, the frame of the house
  holds the second, features alternate between the two by role so neighbours contrast, and the
  star takes the accent (the palette's last colour). Every prop of a role wears the same pair for
  the look. A re-triggered effect swaps its pair on each trigger, so the beat shows as a two-colour
  pattern; a texture holds it; "alternate" motion alternates the pair along the props. The accent
  follows the music: a quiet look stays in its rich colours, a loud one pairs nearly everything
  with the accent. Accents and whole-house hits wear the section's accent.
- **Fades.** Textures fade only into and out of dark, never into the next effect on the same prop
  (the old section-end fade-outs dipped to black mid-song). Quiet entrances and exits take two
  beats, the rest one; a prop that comes in on a loud section, or leaves as the music jumps, cuts
  on the downbeat. Pulses on props that come and go die away in sections under 0.5 intensity and
  breathe in as well under 0.35; On accents decay unless the section is loud; the last hit of a
  hit-then-dark ending fades out. On the synthetic songs, 3% of effects fade in and 6-22% fade
  out (the corpus: 11% and 17%).
- **Shaders.** The dialog loads the 50 built-ins (`kind=builtin`, three pages; without them it
  runs shaderless). Each feel names calm and lively built-ins (Rainbow Sweep is left out: it has
  no colour inputs, so it would ignore the plan). 2D heroes alternate phrases between their
  families and a shader, a whole-house group plays one under a busy section, and a repeated look
  plays the same shader on the same prop. Params are what EffectPropsPanel stores for a picked
  shader: source, input defaults, colour input names, shader id; the palette is the role's pair
  plus the accent. The corpus backs it: Shader lifts 3.6x on whole-house groups.
- **Pictures.** `motifs.ts` draws eleven motifs (star, tree, snowflake, bell, heart, candy cane,
  gift, note, cross, pumpkin, ornament) from shapes, 32 px, 3x3 supersampled, in the look's
  colours. The title picks first (Jingle Bells is a bell, O Holy Night a star, Awesome God a
  cross), then the feel's own. A matrix of at least 200 nodes rotates its phrases through picture,
  family and shader. Quiet: the picture zooms in. Mid: it wiggles a bar at a time. Loud: it peeks
  up or scrolls across, a pass every two bars. Nothing plays over a picture but a whole-house hit.
  At most 8 a sequence: the pixels live in the body, about 10 KB each. The corpus backs it:
  Pictures lifts 5.0x on matrices.
- **Engine.** Pictures gains xLights' `peekaboo`, `wiggle` and `zoom in` movements, which the xsq
  mapping already named. A horizontal matrix now renders into a buffer as wide as a string and as
  tall as the string count (`MatrixModel::InitHMatrix`): it used to keep the vertical buffer and
  turn only the screen positions, so every Text and picture on a Horiz Matrix drew on its side.
- **Score.** The beat part counted brightness change only, so red to green on the beat scored
  nothing. It now measures colour change. On the synthetic songs at 80, 120 and 150 BPM, the
  fit is 90, 78 and 88 with pictures in, against 99, 77 and 86 for the old random colours on the
  old brightness measure. The gap at 80 BPM is mostly pictures: their motion doesn't land on the
  beat.
- **Seen in the app.** Local API on a scratch SQLite copy, the test layout, Jingle Bells at 159
  BPM: the dialog loaded the three shader pages, placed 625 effects including 16 shaders and 7
  pictures, fit 87. Rendered from the app's own renderer: the bell scrolls across the matrix, the
  star peeks up and sinks, and each section's props share its pair
  (`docs/magic-sequence/pictures-shaders.jpg`, `docs/magic-sequence/colour-plan.jpg`).

### The show style (2026-10-09)

Logan asked for sequences as polished as a produced show, with a 2024 full-show video (Tom
BetGeorge's Magical Light Shows) as the reference. About 150 frames were pulled from it, 10 s
apart for the shape and 0.2 s apart inside bars, and compared with this generator. It plays the
house as one instrument where Magic sequenced prop by prop, and the corpus's median song (section
3) is closer to Magic than to it. So the difference is a second style, not a retune: `plan.style`,
"show" by default in the dialog, "classic" (everything above) for anyone who wants the corpus's
look. What the video does, and what "show" does about it:

| In the video | In the show style |
|---|---|
| One colour across the whole house, the next every bar (red, blue, white, green at 11:26-11:56) | Every lit prop wears the section palette's colour for the bar; quiet sections hold a colour per phrase, the rest per two bars. Nothing runs across a change of colour |
| The centre snowflake always contrasts (white on blue, blue on red, red on white) | The focal prop (the star, else the feature nearest the centre) wears the colour before |
| Roofline and windows flooded solid in the loud parts | Loud sections paint frame, fill and focal props with a steady On; features and heroes move inside it |
| White pops on the backbeat over the colour | White flashes (the contrast if the house is white) on beats 2 and 4, on the last beat above 130 BPM, half a beat long, over the frame and the focal prop |
| Black on the rests; a dark beat before the drop | `SongMap.rests` (below) and the beat before a rising whole-house hit cut every effect but the hits and singing faces |
| Breakdowns: three snowflakes flash on the notes, each a new colour, path lights answering, the rest dark (10:38) | A section in the song's quieter half that both neighbours outshine plays call and response on one feature role and one answering role, On on its hits, a new colour each |
| Carol's verse: outlines only, dim, the lit windows sweeping left to right (1:06) | Quiet sections light only the frame tier at half brightness, no shaders or pictures; sweeps cross the house by position (a zone per beat of the bar), not along one role |
| The whole house changes together in the chorus | Loud sections move in unison, and their bar lines are exempt from the 40%-start thinning |

"Loud" is relative: at least 0.7 intensity and of a kind (repeat group) with a section in the
song's louder half, ties broken by energy and choruses first. A feel that lifts every section to
1.0 (Rock on Jingle Bells) still leaves verses that hold back, and a chorus plays alike each time.

**Rests.** `analyzeSong` now finds where the music stops: half-beats 12 dB under the quieter
quartile of the four bars around them, measured 25 ms inside the half-beat (a frame is 46 ms and
the next downbeat's attack leaked into it). The median was the first reference and read the gaps
between drum hits as rests. On the test songs it is conservative: Jingle Bells 4 rests, Silent
Night 2, Carol of the Bells none. `SongMap.version` is 2; a cached version 1 map is analysed again.

**Measured** (best of three seeds, the 32-model test layout, real audio for the songs):

| | Synthetic 80 / 120 / 150 BPM | Jingle Bells | Silent Night | Carol of the Bells |
|---|---|---|---|---|
| classic | 90 / 78 / 88 | 87 | 80 | 81 |
| show | 97 / 97 / 97 | 94 | 82 | 95 |

The beat part is 1.00 for every show run: steady blocks that change on the bar, with white
flashes on the backbeat, change after the beat and almost never in the middle of one. Blocks that
faded to 30% across the bar (On's long-effect default) scored 0.45-0.56 at 120-150 BPM. The cost
is density: a colour a bar is an effect per lit row per bar, about 600-860 a minute on the test
layout against the corpus's p75 of 405. The test allows twice the p75; a real layout's role groups
carry it in fewer rows (1,491 effects for Jingle Bells on the sample show, fit 98 in the app).
Renders from the app's own renderer, three bars of a chorus then a backbeat then a verse:
`docs/magic-sequence/show-style.jpg` and, at the same moments, `classic-style.jpg`.

The AI director is told the style and what it means, and asked for three or four strong colours
that read one after another. Lasers, searchlights, fireworks and flame effects in the video are
hardware this app does not drive.

### Phase 5: vocals, chat edits, shared edits and a learned picker (2026-10-09)

**Vocals.** Singing faces sing. When the song has lyric timing (Auto lyrics, which already times
the words with Whisper on the server, or a Papagayo import) and a singing face has a face
definition, each such face gets one Faces effect for the whole song on the phoneme track, eyes
on Automatic, in place of its VU Meter, texture and show-style darkness (a face cut off before a
drop stops mid-word). Tested by rendering: the mouth's AI nodes light while the track says AI,
the MBP nodes after. A singing-face sub-model (the face on a singing tree) sings with its
parent's definition: sub-model rows used to render without their model, because a definition's
node ranges count the parent's lights, so a Faces or State effect on one drew nothing. They now
get the parent's face and state definitions renumbered into their own nodes (`subModelSource`,
in the preview and the export alike). The dialog says which track the faces will sing, or that
they will once the song has lyric timing. Demucs was not needed: the words come from the lyric
aligner, not from a vocal stem.

**Chat edits.** After a press, *Change it* takes plain language. "less strobe", "no twinkle",
"without lightning" and "make the second chorus bigger", "the verses calmer" are applied by
`edits.ts` with no model and no cost: an effect leaves every role and layer (`plan.avoid`, honoured
for families, the hero texture, accents and hits), and a section's intensity moves a quarter.
Anything else goes to the AI director with the current plan (`POST .../magic-plan` with `edit` and
`plan`; same caps, refusal screen and validation as a plan), which is told to change only what
the edit asks; its answer is filled from the current plan, not the rules plan. Either way the same
seed is placed again under the same single undo. Seen in the app: "less shockwave" took the
sample show from 1,491 effects with Shockwave to 1,499 without, fit 98.

**Shared edits.** Each press keeps a record on the sequence (`metadata.magic`: per row, the role,
tier and seconds of each effect placed; not for New layers on top, whose rows mix in the user's
own effects). When the user has changed the sequence since, the dialog offers *Share what you
changed*: per kind of prop, the seconds placed and the seconds there now, with the song's section
labels, energies and lengths. No audio, names, row identities or layout; the server rejects
anything but roles, tiers, plain effect names and counts. `POST /v1/sequences/{id}/magic-feedback`
(editor access, `throttle:10,1`) keeps one row per person per sequence in `magic_feedback`;
`php artisan magic:export-feedback` writes the payloads, without who shared them, as JSON lines.

**Learned picker.** `tools/sequence-corpus/train-picker.mjs` turns the export into
`apps/web/src/lib/magic/picker.json`: per role and effect, seconds wanted over seconds given,
smoothed towards 1, clamped to 0.05-4, kept once five songs have spoken. The rules director
multiplies it into its effect weights (squared, like the rest, so 0.05 is what it takes to unseat
SingleStrand's 43% on arches). It ships empty, and does nothing until shared edits come in. It is
one multiplier per role and effect; the spec's gradient-boosted picker over section label, energy
and tempo waits for enough data, and the payload already carries those.

**Also fixed.** The Magic Sections timing track had no closing mark, so the last section's label
never made a cell; it ends at the song's end now.

## Out of scope by this build's own terms

`MAGIC-SEQUENCE-GOAL.md` builds phases 0-4 and says phase 5 (vocals, chat edits, learned picker)
"is out of scope on purpose", and that "Beat This! ONNX, Demucs, Whisper and hosted section models
are out of scope for this goal". Beat This! was built anyway at Logan's request (see "Pro
analysis" above), and so was phase 5 on 2026-10-09 (see "Phase 5"). Demucs and hosted section
models are still not used.

## Blocked

Nothing is blocked. The first two items waited on Logan and are done; the third is an open
follow-up on one real layout:

- **Sign-off on three songs** (phase 4's last check): signed off by Logan on 2026-10-08. Worth
  watching in real use: mid-chorus frames
  can read sparse (a SingleStrand chase lights a quarter of a prop, the corpus's median), and a
  strophic carol gets most of its verses labelled chorus.
- **The AI director against a real provider: verified 2026-10-09.** The first live runs (Logan's
  "Awesome God" sequence, Fill empty rows) got `401 authentication_error: invalid x-api-key`: the
  production key had been revoked. The fallback did its job each time (the rules director planned
  it, the dialog said so, the plan credit was refunded), and the cause only showed once the image
  sent Laravel's log to stderr (#175). With a new key in `SHADER_API_KEY`, the same press returned
  `POST /api/v1/sequences/20/magic-plan 200` in about 9 seconds on claude-opus-5-5; the dialog
  placed 1,147 effects from the AI plan (no fallback notice) and the monthly counter went from 20
  to 19 free plans. The result was undone; the sequence is as Logan left it. Fit on this layout:
  36 (loud 0.00, beat 0.53, lift 0.14), in line with the rules director here (see next item).
- **Seen on the same real layout (120 models).** The fit there was low and swung with the seed:
  25, 29 and 53 across three rules-director runs. Its 33 Tree models classified backwards: the two
  6,400-node trees are named "Seed Tree" and "Tree", and the word "tree" made them mini trees
  (features); the 29 100-200 node trees have bare names (MTL1, PTR2, ...), so DisplayAs made
  them mega trees (heroes, lit all song). Fixed 2026-10-09 in `propMap`, leaving the corpus's name
  rules alone: a Tree model whose name doesn't say mini or mega is a mega tree when it has at
  least 400 nodes and half the largest tree's, and a mini tree otherwise (tested on a layout
  built to match). The fit on that layout itself has not been measured again: its data lives on
  pixl.community, not here.

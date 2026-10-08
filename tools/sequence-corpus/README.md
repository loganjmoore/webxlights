# Sequence corpus

What real xLights sequences do, measured, so Magic Sequence (`docs/MAGIC-SEQUENCE.md`) starts
from evidence instead of taste.

- `priors.json` is committed: aggregate statistics only (effect shares by prop role, durations in
  beats, tempo coupling, palette sizes, layering, how activity follows musical intensity, parameter
  medians). No sequence can be rebuilt from it.
- `.corpus/` is not committed (gitignored). The sequences are their authors' work, shared for
  personal use.

## Files

| File | What it does |
|---|---|
| `analyze.mjs` | Reads `<corpus>/<id>/*.xsq[.gz]` (+ the author's `xlights_rgbeffects.xml[.gz]`) and writes `priors.json` and `per-sequence.local.json` |
| `roles.mjs` | Name + DisplayAs → prop role. The app's `propRoles.ts` is a port of it |

## Refreshing

Put each sequence package in its own folder, `.corpus/raw/<id>/`: the `.xsq`, plus the author's
`xlights_rgbeffects.xml` when there is one (either may be gzipped). Then:

```bash
node tools/sequence-corpus/analyze.mjs tools/sequence-corpus/.corpus/raw tools/sequence-corpus
```

`analyze.mjs` drops xLights auto-backups and exact duplicates, and takes at most three sequences per
package (largest first), so one author's whole show folder can't outvote the rest.

## Reading the numbers

- Layer index 0 is the **first** `<EffectLayer>` in the file, which is xLights' top layer.
- "Seconds" shares weight an effect by how long it runs; "count" shares by how often it is placed.
  A role's character is the seconds share; its rhythm is the count share.
- `roleLift[role][effect]` > 1.5 means the effect is used on that role far more than across the
  corpus: that's what "this effect belongs on arches" looks like in numbers.
- `intensity.*` splits each song into thirds by onset density (from the sequence's own "Note
  Onsets" timing track, which xLights computed from the audio) and compares what sequencers do in
  the busy third vs the quiet third.
- `cyclesPerBeat[effect][key].p50 × effect length in beats` gives a tempo-matched speed/cycle value.

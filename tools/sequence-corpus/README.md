# Sequence corpus

What real xLights sequences do, measured, so Magic Sequence (`docs/MAGIC-SEQUENCE.md`) starts
from evidence instead of taste.

- `priors.json` is committed: aggregate statistics only (effect shares by prop role, durations in
  beats, tempo coupling, palette sizes, layering, how activity follows musical intensity, parameter
  medians). No sequence can be rebuilt from it.
- `.corpus/` is not committed (gitignored). The sequences are their authors' work, shared on
  xlightsseq.com for personal use.

## Files

| File | What it does |
|---|---|
| `analyze.mjs` | Reads `<corpus>/<id>/*.xsq[.gz]` (+ the author's `xlights_rgbeffects.xml[.gz]`) and writes `priors.json` and `per-sequence.local.json` |
| `roles.mjs` | Name + DisplayAs → prop role. The app's `propRoles.ts` is a port of it |
| `download-in-browser.js` | Paste into the DevTools console of a signed-in xlightsseq.com tab; saves one slice of the free Christmas category as a `.tar` of gzipped `.xsq`/XML |
| `fetch-external.py` | Same for packages hosted on Google Drive / Dropbox, from an `id<TAB>url` list |

## Refreshing

```bash
# 1. In Chrome, signed in to xlightsseq.com, one fresh tab per slice, DevTools console:
#    paste download-in-browser.js, then magicDownload(0, 45, "s00"), magicDownload(45, 90, "s01"), ...
# 2. Unpack the slices
for t in ~/Downloads/xlseq_*.tar; do tar -xf "$t" -C tools/sequence-corpus/.corpus/raw && rm "$t"; done
# 3. Externally hosted packages (ids with "ext": true in the _log_*.json files)
python3 -I tools/sequence-corpus/fetch-external.py tools/sequence-corpus/.corpus/ext_urls.tsv tools/sequence-corpus/.corpus/raw
# 4. Analyse
node tools/sequence-corpus/analyze.mjs tools/sequence-corpus/.corpus/raw tools/sequence-corpus
```

About 70% of the free listings link out to Google Drive, Dropbox or OneDrive, and resolving those
links needs the signed-in session. What worked in October 2026:

- **Google Drive files**: open `/sequences/<slug>.<id>/download` signed in; the tab lands on
  `drive.google.com/file/d/<fileId>/view`. Put that URL in the tsv; `fetch-external.py` downloads it
  without a login.
- **Google Drive folders**: `https://drive.google.com/embeddedfolderview?id=<folderId>` lists the
  files without a login. Take the `.xsqz`, else the `.zip`, else the `.xsq`.
- **Dropbox**: the share key is part of the URL, so download it in the browser (`dl=1`) and give
  `fetch-external.py` the local path instead of a URL. Chrome allows one automatic download per
  tab, so use a fresh tab for each.
- Some links go straight to a file. Visiting them downloads it; it's the same local-path case.

`analyze.mjs` drops xLights auto-backups and exact duplicates, and takes at most three sequences per
listing (largest first), so one author's whole show folder can't outvote the rest.

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

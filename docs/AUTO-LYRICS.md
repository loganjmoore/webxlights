# Automatic lyric timing

**What it does:** paste a song's lyrics into Sequencer > Windows > Timing tracks > Auto lyrics,
press *Time the lyrics*, and a few minutes later the sequence has three timing tracks - Lyrics
(one mark per line), Lyrics — Words and Lyrics — Phonemes - with every mark where that word is
sung. The phonemes track is what a Faces effect reads. *Download .xtiming* saves the three as an
xLights timing file for the desktop app's Import Timing Track.

This is the same job [autolyrics.lightingfanatics.com](https://autolyrics.lightingfanatics.com/)
does for xLights users (MP3 plus pasted lyrics in, `.xtiming` out), built into the sequencer so
there is no file to carry across. Like that tool, it gets most of the way there: expect to play
the song through and nudge a few marks.

## How it works

1. **Listen.** The server sends the sequence's stored audio to a speech-to-text model that
   returns a start and end for every word it heard (OpenAI's `whisper-1` by default). The pasted
   lyrics go along as the prompt, which pulls the recognition towards the words actually sung.
   The listen runs in the web process after the request has been answered - the audio sits on
   that service's own disk - and the browser polls for the result.
2. **Look the words up.** Each lyric word is looked up in the CMU Pronouncing Dictionary
   (`apps/api/database/data/cmudict.dict.gz`, BSD licence alongside) for its ARPAbet
   pronunciation. That is what turns "Christmas" into K-R-IH-S-M-AH-S rather than into its
   letters.
3. **Line it up.** In the browser (`apps/web/src/lib/lyricAlign.ts`), the heard words are
   matched to the pasted lyrics with a longest-common-subsequence alignment: a misheard, extra or
   missing word costs only itself. Matched lyric words take the heard times; words nobody heard
   are spread across the gap between their heard neighbours, longer words getting longer. Time
   only runs forwards, so a repeated chorus matched to the wrong verse cannot overlap.
4. **Make the tracks.** Lines become phrases, words stay words, and each word's mouth shapes are
   the Preston Blair set mapped from its ARPAbet (the mapping Papagayo ships), or from its letters
   when the dictionary does not know the word. Same three tracks a Papagayo import makes.

## Setting it up

| Variable | Meaning | Default |
| --- | --- | --- |
| `LYRICS_API_KEY` | Key for the transcription endpoint (`OPENAI_API_KEY` is read too). Unset means the feature answers "not configured". | unset |
| `LYRICS_BASE_URL` | Any endpoint with OpenAI's `/audio/transcriptions` shape and word timestamps. | `https://api.openai.com/v1` |
| `LYRICS_MODEL` | The model name sent. | `whisper-1` |
| `LYRICS_MONTHLY_LIMIT` | Server-funded listens per person per calendar month; 0 for uncapped. | `20` |

Audio is capped at 25MB (the endpoint's limit); a 128kbps MP3 of any normal song is well under.
Each listen is one ledger row (`reason: lyric_alignment`), refunded if the listen fails, so the
month's count and the bill cannot disagree. Starts are throttled to six a minute.

## Known limits

- A timing mark runs to the next one. Words and phrases in this app's flat timing tracks have
  no gaps between them, so the last word of a line runs up to the first word of the next. xLights
  users are used to this; a Faces effect reads the phoneme it is on.
- The dictionary is American English. A word it does not know falls back to letter-based
  shapes, which is roughly right and never empty.
- Heavy backing vocals or a very loud mix lose words; the alignment places them between the
  ones it did hear, which is usually close enough to drag from.

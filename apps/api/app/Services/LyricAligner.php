<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Automatic lyric timing, the way autolyrics.lightingfanatics.com does it: listen to the song
 * with the lyrics as a hint, get every word's start and end, and look each word up in the CMU
 * Pronouncing Dictionary so the mouth shapes come from how the word is said, not spelt.
 *
 * The listening is a speech-to-text model that returns word timestamps (OpenAI's whisper-1 by
 * default; any endpoint with the same shape works via LYRICS_BASE_URL). The lyrics go along as
 * the prompt, which pulls the recognition towards the words that are actually sung. Matching
 * what was heard to what was pasted, and building the phrase, word and phoneme tracks, happens
 * in the browser (apps/web/src/lib/lyricAlign.ts) where it can be tested without an API.
 */
class LyricAligner
{
    /** The transcription endpoint's file limit; a bigger upload is refused before it is sent. */
    public const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

    /**
     * @return array{words: list<array{text: string, start: float, end: float}>, language: ?string, model: string}
     */
    public function transcribe(string $audioPath, string $filename, string $lyrics): array
    {
        $key = config('services.lyrics.key');
        if (! $key) {
            throw new RuntimeException('Automatic lyric timing is not configured on this server (LYRICS_API_KEY).');
        }
        $size = filesize($audioPath);
        if ($size === false || $size > self::MAX_AUDIO_BYTES) {
            throw new RuntimeException('The audio is larger than 25MB. Export a smaller MP3 (128kbps is plenty) and upload that.');
        }
        $model = config('services.lyrics.model') ?: 'whisper-1';
        $response = Http::timeout(600)
            ->withToken($key)
            ->acceptJson()
            ->attach('file', file_get_contents($audioPath), $filename)
            ->post(rtrim(config('services.lyrics.base_url'), '/').'/audio/transcriptions', [
                'model' => $model,
                'response_format' => 'verbose_json',
                'timestamp_granularities[]' => 'word',
                // The prompt is a hint about vocabulary and style; it is capped by the model at a
                // couple of hundred tokens, so the first lines carry the most useful signal.
                'prompt' => mb_substr(preg_replace('/\s+/', ' ', $lyrics) ?? '', 0, 800),
            ]);
        if (! $response->successful()) {
            $why = $response->json('error.message') ?: "HTTP {$response->status()}";
            throw new RuntimeException("The transcription service refused the audio: {$why}");
        }
        $words = [];
        foreach ($response->json('words') ?? [] as $w) {
            if (! isset($w['word'], $w['start'], $w['end'])) {
                continue;
            }
            $words[] = ['text' => trim((string) $w['word']), 'start' => (float) $w['start'], 'end' => (float) $w['end']];
        }

        return ['words' => $words, 'language' => $response->json('language'), 'model' => $model];
    }

    /**
     * ARPAbet pronunciations for the words that are in the dictionary, keyed by the word as
     * normalised (lower case, letters and apostrophes). A word that is not there is left out,
     * and the browser falls back to its letter-based shapes for it.
     *
     * @param  list<string>  $words
     * @return array<string, list<string>>
     */
    public function pronunciations(array $words): array
    {
        $wanted = [];
        foreach ($words as $word) {
            $key = self::normalise($word);
            if ($key !== '') {
                $wanted[$key] = true;
            }
        }
        if ($wanted === []) {
            return [];
        }
        $found = [];
        // ponytail: streamed through 135k lines per call (~60ms); a table if this is ever hot.
        $handle = gzopen(database_path('data/cmudict.dict.gz'), 'rb');
        if ($handle === false) {
            throw new RuntimeException('The pronouncing dictionary is missing.');
        }
        try {
            while (($line = gzgets($handle)) !== false) {
                $space = strpos($line, ' ');
                if ($space === false) {
                    continue;
                }
                $head = substr($line, 0, $space);
                // "word(2)" is an alternative pronunciation; the first listed is the common one.
                if (str_contains($head, '(') || ! isset($wanted[$head]) || isset($found[$head])) {
                    continue;
                }
                $phones = trim(substr($line, $space + 1));
                // A trailing "# comment" on some entries.
                $hash = strpos($phones, '#');
                if ($hash !== false) {
                    $phones = trim(substr($phones, 0, $hash));
                }
                $found[$head] = explode(' ', $phones);
                if (count($found) === count($wanted)) {
                    break;
                }
            }
        } finally {
            gzclose($handle);
        }

        return $found;
    }

    public static function normalise(string $word): string
    {
        return preg_replace('/[^a-z\']/', '', strtolower($word)) ?? '';
    }
}

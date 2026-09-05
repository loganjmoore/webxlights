<?php

namespace App\Jobs;

use App\Models\LyricAlignment;
use App\Services\LyricAligner;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * Listens to a sequence's audio and stores what was heard on the alignment row.
 *
 * Dispatched after the response rather than onto the queue: the audio lives on the web
 * service's own disk, which the worker cannot see, and the browser polls the row anyway.
 */
class AlignLyrics
{
    use Dispatchable;

    public function __construct(public LyricAlignment $alignment) {}

    public function handle(LyricAligner $aligner): void
    {
        // Listening to a four-minute song takes the transcription service a while; the web
        // request that queued this has already been answered.
        set_time_limit(0);
        $alignment = $this->alignment;
        $alignment->update(['status' => 'running']);
        try {
            $sequence = $alignment->sequence;
            if (! $sequence?->audio_path || ! Storage::disk('audio')->exists($sequence->audio_path)) {
                throw new RuntimeException('The sequence has no audio to listen to.');
            }
            $heard = $aligner->transcribe(
                Storage::disk('audio')->path($sequence->audio_path),
                $sequence->audio_filename ?: basename($sequence->audio_path),
                $alignment->lyrics,
            );
            $lyricWords = preg_split('/\s+/', $alignment->lyrics, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $alignment->update([
                'status' => 'done',
                'result' => [
                    'words' => $heard['words'],
                    'language' => $heard['language'],
                    'model' => $heard['model'],
                    'pronunciations' => $aligner->pronunciations($lyricWords),
                ],
            ]);
        } catch (Throwable $e) {
            $alignment->update(['status' => 'failed', 'error' => $e->getMessage()]);
            // The slot goes back: a failed listen is not a used one.
            $alignment->user?->moveCredits(0, 'refund', ['lyric_alignment' => $alignment->id, 'error' => class_basename($e)]);
            if (! $e instanceof RuntimeException) {
                report($e);
            }
        }
    }
}

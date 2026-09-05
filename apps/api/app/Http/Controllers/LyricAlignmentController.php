<?php

namespace App\Http\Controllers;

use App\Jobs\AlignLyrics;
use App\Models\LyricAlignment;
use App\Models\Sequence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Automatic lyric timing: paste the lyrics, the server listens to the song, the browser polls
 * for the result and turns it into phrase, word and phoneme tracks.
 *
 * Funded the same way as the shader assistant - a monthly allowance per person, counted from
 * the credit ledger so a failed listen gives the slot back.
 */
class LyricAlignmentController extends Controller
{
    public function store(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user(), 'editor');
        $data = $request->validate(['lyrics' => ['required', 'string', 'min:2', 'max:20000']]);
        $user = $request->user();

        if (! $sequence->audio_path || ! Storage::disk('audio')->exists($sequence->audio_path)) {
            return response()->json(['message' => 'Upload the song first: the timing comes from listening to it.', 'code' => 'no_audio'], 422);
        }
        if (! config('services.lyrics.key')) {
            return response()->json(['message' => 'Automatic lyric timing is not configured on this server (LYRICS_API_KEY).', 'code' => 'not_configured'], 503);
        }
        if (($monthly = (int) config('services.lyrics.monthly_limit')) > 0 && $this->alignmentsThisMonth($user) >= $monthly) {
            return response()->json([
                'message' => "You have used this month's {$monthly} automatic lyric timings. The allowance resets on the 1st.",
                'code' => 'monthly_limit',
                'monthly_limit' => $monthly,
                'resets_at' => now('UTC')->addMonthNoOverflow()->startOfMonth()->toIso8601String(),
            ], 429);
        }

        $alignment = LyricAlignment::create([
            'sequence_id' => $sequence->id,
            'user_id' => $user->id,
            'status' => 'queued',
            'lyrics' => $data['lyrics'],
        ]);
        // Counted before the listen, refunded by the job if it fails.
        $user->moveCredits(0, 'lyric_alignment', ['lyric_alignment' => $alignment->id, 'sequence' => $sequence->id]);
        AlignLyrics::dispatchAfterResponse($alignment);

        return response()->json($this->present($alignment), 202);
    }

    /** The newest timing for this sequence, so a reload can pick up where the wait left off. */
    public function latest(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user());
        $alignment = LyricAlignment::where('sequence_id', $sequence->id)->latest('id')->first();

        return $alignment ? $this->present($alignment) : response()->json(null);
    }

    private function present(LyricAlignment $a): array
    {
        return [
            'id' => $a->id,
            'status' => $a->status,
            'lyrics' => $a->lyrics,
            'result' => $a->status === 'done' ? $a->result : null,
            'error' => $a->error,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }

    private function alignmentsThisMonth($user): int
    {
        $month = $user->creditTransactions()->where('created_at', '>=', now('UTC')->startOfMonth());

        return (clone $month)->where('reason', 'lyric_alignment')->count()
            - (clone $month)->where('reason', 'refund')->where('meta->lyric_alignment', '!=', null)->count();
    }
}

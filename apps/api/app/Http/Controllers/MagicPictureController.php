<?php

namespace App\Http\Controllers;

use App\Jobs\DrawMagicPictures;
use App\Models\MagicPicture;
use App\Services\Magic\PictureMaker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Pictures for the matrix drawn by an image model (PictureMaker), kept for everyone.
 *
 * Asking for a subject someone has already had drawn costs nothing and returns that drawing;
 * only a new drawing counts against the person's monthly allowance, recorded in the credit ledger
 * under its own reasons like the AI director's plans. The drawing happens after the response and
 * the browser polls, as for the lyric listening.
 */
class MagicPictureController extends Controller
{
    public function store(Request $request, PictureMaker $maker)
    {
        $data = $request->validate([
            'subjects' => ['required', 'array', 'min:1', 'max:8'],
            'subjects.*' => ['required', 'string', 'min:2', 'max:120'],
        ]);
        if (! $maker->configured()) {
            return response()->json(['message' => 'Picture drawing is not configured on this server (OPENAI_API_KEY).', 'code' => 'not_configured'], 503);
        }
        $user = $request->user();
        $monthly = (int) config('services.pictures.monthly_limit');
        $used = $this->drawnThisMonth($user);
        $out = [];
        $queued = [];
        foreach (array_unique($data['subjects']) as $raw) {
            $subject = PictureMaker::subject($raw);
            if ($subject === null) {
                $out[] = ['id' => null, 'subject' => $raw, 'status' => 'refused', 'error' => 'That is not something these pictures draw.', 'url' => null];

                continue;
            }
            $picture = MagicPicture::firstWhere('subject_key', PictureMaker::key($subject));
            // Already drawn, or on its way: everyone shares it, free.
            if ($picture && $picture->status !== 'failed') {
                $out[] = $this->present($picture);

                continue;
            }
            if ($monthly > 0 && $used >= $monthly) {
                $out[] = ['id' => null, 'subject' => $subject, 'status' => 'limit', 'error' => "You have used this month's {$monthly} new pictures. Ones already drawn are still free.", 'url' => null];

                continue;
            }
            $picture ??= new MagicPicture(['subject' => $subject, 'subject_key' => PictureMaker::key($subject)]);
            $picture->fill(['status' => 'queued', 'error' => null, 'user_id' => $user->id])->save();
            // Counted before the drawing, given back by the job if it fails.
            $user->moveCredits(0, 'magic_picture', ['magic_picture' => $picture->id]);
            $used++;
            $queued[] = $picture->id;
            $out[] = $this->present($picture);
        }
        if ($queued) {
            DrawMagicPictures::dispatchAfterResponse($queued);
        }

        return response()->json(['pictures' => $out, 'monthly_limit' => $monthly, 'used_this_month' => $used], $queued ? 202 : 200);
    }

    /** The pictures by id, for the poll. */
    public function index(Request $request)
    {
        $data = $request->validate(['ids' => ['required', 'string', 'regex:/^\d+(,\d+){0,15}$/']]);
        $ids = array_map('intval', explode(',', $data['ids']));

        return response()->json(['pictures' => MagicPicture::whereIn('id', $ids)->get()->map(fn ($p) => $this->present($p))->values()]);
    }

    public function image(MagicPicture $picture)
    {
        abort_if($picture->status !== 'done' || ! $picture->path || ! Storage::disk('audio')->exists($picture->path), 404);

        // A drawing never changes: its key names its subject and style.
        return Storage::disk('audio')->response($picture->path, "{$picture->id}.png", [
            'Content-Type' => 'image/png',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    private function present(MagicPicture $picture): array
    {
        return [
            'id' => $picture->id,
            'subject' => $picture->subject,
            'status' => $picture->status,
            'error' => $picture->status === 'failed' ? $picture->error : null,
            'url' => $picture->status === 'done' ? "/api/v1/magic/pictures/{$picture->id}/image" : null,
        ];
    }

    /** New drawings this month, failed ones given back. */
    private function drawnThisMonth($user): int
    {
        $rows = $user->creditTransactions()->where('created_at', '>=', now('UTC')->startOfMonth());

        return max(0, (clone $rows)->where('reason', 'magic_picture')->count() - (clone $rows)->where('reason', 'magic_picture_refund')->count());
    }
}

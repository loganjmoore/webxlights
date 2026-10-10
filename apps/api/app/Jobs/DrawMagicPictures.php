<?php

namespace App\Jobs;

use App\Models\MagicPicture;
use App\Services\Magic\PictureMaker;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Draws the queued pictures and keeps them on the web service's disk.
 *
 * After the response, like the lyric listening: the drawings live on the web service's own disk,
 * which the worker cannot see, and the browser polls the rows anyway. A failed drawing gives its
 * slot back to whoever asked for it.
 */
class DrawMagicPictures
{
    use Dispatchable;

    /** @param  int[]  $ids */
    public function __construct(public array $ids) {}

    public function handle(PictureMaker $maker): void
    {
        set_time_limit(0);
        $pictures = MagicPicture::whereIn('id', $this->ids)->where('status', 'queued')->get()->keyBy('id');
        if ($pictures->isEmpty()) {
            return;
        }
        MagicPicture::whereIn('id', $pictures->keys())->update(['status' => 'running']);
        try {
            $drawn = $maker->drawAll($pictures->map->subject->all());
        } catch (Throwable $e) {
            $drawn = $pictures->map(fn () => ['png' => null, 'error' => $e->getMessage()])->all();
            report($e);
        }
        foreach ($pictures as $id => $picture) {
            ['png' => $png, 'error' => $error] = $drawn[$id] ?? ['png' => null, 'error' => 'Nothing came back.'];
            if ($png !== null) {
                $path = "magic-pictures/{$picture->subject_key}.png";
                Storage::disk('audio')->put($path, $png);
                $picture->update(['status' => 'done', 'path' => $path, 'model' => config('services.pictures.model'), 'error' => null]);
            } else {
                $picture->update(['status' => 'failed', 'error' => $error]);
                $picture->user_id && \App\Models\User::find($picture->user_id)?->moveCredits(0, 'magic_picture_refund', ['magic_picture' => $picture->id]);
            }
        }
    }
}

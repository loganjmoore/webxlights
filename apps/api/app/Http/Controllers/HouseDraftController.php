<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use App\Models\User;
use App\Services\HouseGenerator;
use App\Services\HouseSources;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

class HouseDraftController extends Controller
{
    public function lookup(Request $request, Layout $layout, HouseSources $sources)
    {
        $layout->project->authorize($request->user(), 'editor');
        $data = $request->validate(['address' => ['required', 'string', 'min:8', 'max:250']]);
        try { $places = $sources->search(trim($data['address'])); }
        catch (ConnectionException|RequestException) { abort(503, 'Address search is temporarily unavailable. Please try again shortly.'); }
        if (!$places) {
            // Own photos can model an unmapped home; no coordinates are invented.
            $places = [['label' => trim($data['address']), 'name' => '', 'lat' => null, 'lng' => null, 'osmType' => '', 'osmId' => 0, 'unmapped' => true]];
        }
        $candidates = [];
        foreach ($places as $place) {
            $token = (string) Str::uuid();
            Cache::put($this->selectionKey($request, $layout, $token), $place, 1800);
            $candidates[] = ['token' => $token, 'label' => $place['label']];
        }
        return response()->json(['candidates' => $candidates])->header('Cache-Control', 'private, no-store');
    }

    private function selectionKey(Request $request, Layout $layout, string $token): string
    {
        return "house-selection:{$request->user()->id}:{$layout->id}:$token";
    }

    public function generate(Request $request, Layout $layout, HouseSources $sources, HouseGenerator $generator)
    {
        $layout->project->authorize($request->user(), 'editor');
        set_time_limit(360);
        $data = $request->validate([
            'token' => ['required', 'uuid'], 'requestId' => ['required', 'uuid'],
            'photos' => ['sometimes', 'array', 'max:4'], 'photos.*' => ['string', 'max:7000000'],
        ]);
        $place = Cache::get($this->selectionKey($request, $layout, $data['token']));
        abort_unless($place, 422, 'This address selection expired. Search for the address again.');
        abort_unless(config('services.house.key'), 503, 'House generation is not configured on this server yet. Your existing layout is unchanged.');
        $key = 'house-draft:'.$request->user()->id.':'.$layout->id.':'.$data['requestId'];
        $fingerprint = hash('sha256', json_encode([$data['token'], $data['photos'] ?? []]));
        if ($cached = Cache::get($key)) {
            abort_unless(hash_equals($cached['fingerprint'], $fingerprint), 409, 'This draft request has changed. Start a new draft.');
            return response()->json($cached['result'])->header('Cache-Control', 'private, no-store');
        }
        $lock = Cache::lock($key.':lock', 400);
        abort_unless($lock->get(), 409, 'This house draft is still being generated. Wait for it to finish before retrying.');
        try {
            if ($cached = Cache::get($key)) {
                abort_unless(hash_equals($cached['fingerprint'], $fingerprint), 409, 'This draft request has changed. Start a new draft.');
                return response()->json($cached['result'])->header('Cache-Control', 'private, no-store');
            }
            $photos = [];
            foreach ($data['photos'] ?? [] as $photo) {
                if (!preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$~', $photo, $match)) abort(422, 'Use JPEG, PNG, or WebP house photos.');
                $bytes = base64_decode($match[2], true);
                abort_if($bytes === false, 422, 'A house photo could not be read.');
                $photos[] = [...HouseSources::imageBytes($bytes), 'context' => 'User-supplied photo of their own target house.'];
            }
            $warnings = [];
            try { $building = $sources->building($place); }
            catch (\Throwable) { $building = []; $warnings[] = 'Mapped dimensions were unavailable; dimensions are estimated from photos.'; }
            if (!$photos && ($place['unmapped'] ?? false)) {
                abort(422, 'This address is not mapped yet. Add your own front and side photos below to model this house.');
            }
            if (!$photos) {
                try { $photos = $sources->streetPhotos($place); }
                catch (\Throwable) { $warnings[] = 'Street imagery was unavailable.'; }
                if (!$photos) {
                    try { $photos = $sources->commonsPhotos($building); }
                    catch (\Throwable) { /* The user can supply their own photos when public coverage is absent. */ }
                }
            }
            abort_unless($photos, 422, 'No usable public house photos were found for this address. Add your own front and side photos below, then generate again.');
            DB::transaction(function () use ($request) {
                $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                $used = $user->creditTransactions()->where('reason', 'house_generation')->where('created_at', '>=', now('UTC')->startOfMonth())->count();
                $limit = config('services.house.monthly_limit');
                abort_if($limit > 0 && $used >= $limit, 429, "You have used this month's $limit house-generation attempts. Try again next month.");
                // A separate allowance in the existing ledger, with no address, images, or credit debit.
                // Reserved before the paid request, even if a client loses the response.
                $user->moveCredits(0, 'house_generation');
            });
            $generationStarted = microtime(true);
            try { $result = $generator->generate($place, $building, $photos); }
            catch (ConnectionException|RequestException $e) {
                // Diagnose provider limits without logging addresses, photos, keys or response bodies.
                \Illuminate\Support\Facades\Log::warning('House generation request failed', [
                    'failure' => class_basename($e),
                    'upstream_status' => $e instanceof RequestException ? $e->response->status() : null,
                    'elapsed_seconds' => round(microtime(true) - $generationStarted, 1),
                ]);
                abort(503, 'House generation could not finish. Your layout is unchanged. Please try again.');
            }
            $result['warnings'] = $warnings;
            Cache::put($key, ['fingerprint' => $fingerprint, 'result' => $result], 600);
            return response()->json($result)->header('Cache-Control', 'private, no-store');
        } finally {
            $lock->release();
        }
    }
}

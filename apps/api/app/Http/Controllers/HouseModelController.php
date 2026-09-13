<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HouseModelController extends Controller
{
    public static function revision(?array $house): string
    {
        return hash('sha256', json_encode($house));
    }

    public function show(Request $request, Layout $layout)
    {
        $layout->project->authorize($request->user());
        $house = ($layout->settings ?? [])['houseModel'] ?? null;
        return ['houseModel' => $house, 'revision' => self::revision($house)];
    }

    public function replace(Request $request, Layout $layout)
    {
        $layout->project->authorize($request->user(), 'editor');
        $request->validate(['houseModel' => ['present', 'nullable', 'array'], 'if_match' => ['sometimes', 'string', 'size:64']]);
        $house = \App\Services\HouseGeometry::validate($request->input('houseModel'));
        DB::transaction(function () use ($layout, $house, $request) {
            $locked = Layout::whereKey($layout->id)->lockForUpdate()->firstOrFail();
            $settings = $locked->settings ?? [];
            if ($request->has('if_match')) {
                abort_unless(hash_equals(self::revision($settings['houseModel'] ?? null), $request->input('if_match')), 409, 'The house changed in another window. Reload the layout before saving.');
            }
            if ($house === null) {
                unset($settings['houseModel']);
            } else {
                $settings['houseModel'] = $house;
            }
            $locked->update(['settings' => $settings]);
        });

        return ['houseModel' => $house, 'revision' => self::revision($house)];
    }
}

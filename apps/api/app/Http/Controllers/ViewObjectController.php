<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use Illuminate\Http\Request;

// M15.7: real xLights' <view_objects> (Gridlines, Mesh, Terrain, Ruler...) - import + list
// only, matching Model Groups' pre-M15.5 scope. No manual create/edit UI yet since there's no
// real user workflow for hand-authoring a Gridlines helper the way there is for models/groups.
class ViewObjectController extends Controller
{
    public function index(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout);

        return $layout->viewObjects()->get();
    }

    // Bulk upsert (by name, unique within a layout) - same convention as models/model-groups.
    public function bulkUpsert(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout, 'editor');

        $data = $request->validate([
            'objects' => ['required', 'array'],
            'objects.*.name' => ['required', 'string'],
            'objects.*.type' => ['required', 'string'],
            'objects.*.supported' => ['boolean'],
            'objects.*.raw_attrs' => ['array'],
        ]);

        $result = collect($data['objects'])->map(fn ($o) => $layout->viewObjects()->updateOrCreate(
            ['name' => $o['name']],
            ['type' => $o['type'], 'supported' => $o['supported'] ?? false, 'raw_attrs' => $o['raw_attrs'] ?? []],
        ));

        return response()->json($result, 201);
    }

    private function authorizeLayout(Request $request, Layout $layout, string $need = 'viewer'): void
    {
        $layout->project->authorize($request->user(), $need);
    }
}

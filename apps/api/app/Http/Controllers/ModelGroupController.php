<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ModelGroupController extends Controller
{
    public function index(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout);

        return $layout->modelGroups()->with('members:id,name')->get();
    }

    // Bulk upsert (by name, unique within a layout), members resolved by model name so the
    // importer can create groups + memberships in the same pass it creates models.
    public function bulkUpsert(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout, 'editor');

        $data = $request->validate([
            'groups' => ['required', 'array'],
            'groups.*.name' => ['required', 'string'],
            'groups.*.bufferStyle' => ['nullable', 'string'],
            'groups.*.memberNames' => ['array'],
            'groups.*.memberNames.*' => ['string'],
        ]);

        $result = DB::transaction(function () use ($layout, $data) {
            $groups = [];
            $modelIdsByName = $layout->models()->pluck('id', 'name');

            foreach ($data['groups'] as $g) {
                $group = $layout->modelGroups()->updateOrCreate(
                    ['name' => $g['name']],
                    ['buffer_style' => $g['bufferStyle'] ?? 'Default'],
                );

                $memberIds = collect($g['memberNames'] ?? [])
                    ->map(fn ($name) => $modelIdsByName[$name] ?? null)
                    ->filter()
                    ->values();

                $group->members()->sync($memberIds->mapWithKeys(fn ($id, $i) => [$id => ['order' => $i]]));
                $groups[] = $group->load('members:id,name');
            }

            return $groups;
        });

        return response()->json($result, 201);
    }

    private function authorizeLayout(Request $request, Layout $layout, string $need = 'viewer'): void
    {
        $layout->project->authorize($request->user(), $need);
    }
}

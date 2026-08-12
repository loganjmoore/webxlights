<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use App\Models\ModelGroup;
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

    // M15.5: the Layout page's Groups panel - real xLights lets you create/rename/delete a
    // group and edit its membership entirely from the Layout tab; webXLights previously only
    // ever created a group via rgbeffects.xml import (bulkUpsert above), with no path to remove
    // one. bulkUpsert already covers create/rename/re-membership (upsert by name).
    public function destroy(Request $request, Layout $layout, ModelGroup $modelGroup)
    {
        $this->authorizeLayout($request, $layout, 'editor');
        abort_unless($modelGroup->layout_id === $layout->id, 404);

        $modelGroup->delete();

        return response()->noContent();
    }

    private function authorizeLayout(Request $request, Layout $layout, string $need = 'viewer'): void
    {
        $layout->project->authorize($request->user(), $need);
    }
}

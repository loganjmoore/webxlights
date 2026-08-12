<?php

namespace App\Http\Controllers;

use App\Models\Controller as ControllerModel;
use App\Models\Layout;
use App\Models\ModelEntity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ModelEntityController extends Controller
{
    public function index(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout);

        return $layout->models()->orderBy('order')->get();
    }

    // Bulk upsert (by name, unique within a layout) — how the rgbeffects importer persists
    // everything it parsed client-side in one request instead of one per model.
    public function bulkUpsert(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout, 'editor');

        $data = $request->validate([
            'models' => ['required', 'array'],
            'models.*.name' => ['required', 'string'],
            'models.*.type' => ['required', 'string'],
            'models.*.supported' => ['boolean'],
            'models.*.params' => ['array'],
            'models.*.raw_attrs' => ['array'],
            'models.*.screen' => ['array'],
            'models.*.strings' => ['nullable', 'integer'],
            'models.*.nodes_per_string' => ['nullable', 'integer'],
            'models.*.string_type' => ['nullable', 'string'],
            'models.*.start_channel' => ['nullable', 'string'],
            'models.*.order' => ['integer'],
        ]);

        $result = DB::transaction(function () use ($layout, $data) {
            $models = [];
            foreach ($data['models'] as $i => $m) {
                $models[] = $layout->models()->updateOrCreate(
                    ['name' => $m['name']],
                    [
                        'type' => $m['type'],
                        'supported' => $m['supported'] ?? true,
                        'params' => $m['params'] ?? [],
                        'raw_attrs' => $m['raw_attrs'] ?? [],
                        'screen' => $m['screen'] ?? [],
                        'strings' => $m['strings'] ?? null,
                        'nodes_per_string' => $m['nodes_per_string'] ?? null,
                        'string_type' => $m['string_type'] ?? null,
                        'start_channel' => $m['start_channel'] ?? null,
                        'order' => $m['order'] ?? $i,
                    ],
                );
            }

            return $models;
        });

        return response()->json($result, 201);
    }

    public function update(Request $request, Layout $layout, ModelEntity $model)
    {
        $this->authorizeLayout($request, $layout, 'editor');
        abort_unless($model->layout_id === $layout->id, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string'],
            'screen' => ['sometimes', 'array'],
            'params' => ['sometimes', 'array'],
            'order' => ['sometimes', 'integer'],
            'controller_id' => ['sometimes', 'nullable', 'integer', 'exists:controllers,id'],
            'controller_offset' => ['sometimes', 'nullable', 'integer', 'min:0'],
            // Channel geometry lives in packages/engine (TS-only) - the client computes this
            // the same way fseqExport.ts does and submits it here. The server doesn't re-derive
            // node counts, it just enforces the size constraint arithmetically - see DECISIONS.md M11.
            'channel_count' => ['sometimes', 'integer', 'min:0'],
        ]);

        $controllerId = array_key_exists('controller_id', $data) ? $data['controller_id'] : $model->controller_id;
        if ($controllerId !== null) {
            $offset = $data['controller_offset'] ?? $model->controller_offset ?? 0;
            $channelCount = $data['channel_count'] ?? $model->channel_count ?? 0;
            $controller = ControllerModel::findOrFail($controllerId);
            abort_unless($controller->project_id === $layout->project_id, 404);

            if ($offset + $channelCount > $controller->channel_count) {
                throw ValidationException::withMessages([
                    'controller_offset' => ["This assignment (offset {$offset} + {$channelCount} channels) exceeds the controller's {$controller->channel_count}-channel span."],
                ]);
            }
        }

        $model->update($data);

        return $model;
    }

    // M13: the necessary complement to drag-to-create — a mis-typed or duplicate drop from the
    // model palette has no other recovery path (no structural-param editor exists yet).
    public function destroy(Request $request, Layout $layout, ModelEntity $model)
    {
        $this->authorizeLayout($request, $layout, 'editor');
        abort_unless($model->layout_id === $layout->id, 404);

        $model->delete();

        return response()->noContent();
    }

    private function authorizeLayout(Request $request, Layout $layout, string $need = 'viewer'): void
    {
        $layout->project->authorize($request->user(), $need);
    }
}

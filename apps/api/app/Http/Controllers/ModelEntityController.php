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
            'models.*.sub_models' => ['array'],
            'models.*.states' => ['array'],
            'models.*.faces' => ['array'],
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
                        'sub_models' => $m['sub_models'] ?? [],
                        'states' => $m['states'] ?? [],
                        'faces' => $m['faces'] ?? [],
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
            // M15.2: the structural-property editor (Layout page) - replaces raw_attrs wholesale,
            // same convention as `screen` (caller spreads the model's existing raw_attrs first).
            'raw_attrs' => ['sometimes', 'array'],
            'order' => ['sometimes', 'integer'],
            // The in-app sub-model editor (Layout page). Replaced wholesale like `screen` and
            // `raw_attrs`: a sub-model list is only ever read and written as a set, and a partial
            // patch would need a stable id per sub-model, which xLights' format doesn't give them.
            'sub_models' => ['sometimes', 'array'],
            'sub_models.*.name' => ['required', 'string', 'max:200'],
            'sub_models.*.type' => ['required', 'string', 'in:ranges,subbuffer'],
            'sub_models.*.rows' => ['array'],
            'sub_models.*.rows.*' => ['string', 'max:2000'],
            'sub_models.*.subBuffer' => ['nullable', 'string', 'max:200'],
            'sub_models.*.vertical' => ['boolean'],
            // The in-app state editor (Layout page), replaced wholesale for the same reason.
            // The manual caps a definition at 40 states; that is enforced where they are edited
            // rather than here, so an import carrying more doesn't quietly lose the rest.
            'states' => ['sometimes', 'array'],
            'states.*.name' => ['required', 'string', 'max:200'],
            'states.*.entries' => ['array'],
            'states.*.entries.*.name' => ['required', 'string', 'max:200'],
            'states.*.entries.*.nodes' => ['required', 'string', 'max:2000'],
            'states.*.entries.*.color' => ['nullable', 'string', 'max:9'],
            // Face definitions, same wholesale replacement. A mouth with no nodes is allowed here
            // and isn't in a state, because a face is created with every phoneme listed and the
            // ranges filled in one at a time - rejecting the empty ones would make it unsaveable
            // until it was finished in a single sitting.
            'faces' => ['sometimes', 'array'],
            'faces.*.name' => ['required', 'string', 'max:200'],
            'faces.*.kind' => ['sometimes', 'string', 'in:nodes,matrix'],
            'faces.*.placement' => ['sometimes', 'nullable', 'string', 'in:Centered,Scaled'],
            // A matrix face's pictures. Already downscaled client-side to the model's own size
            // (capped at 64px), the same way the Pictures effect's are - a full-resolution photo
            // on a model row would be megabytes of JSON fetched with every layout load.
            'faces.*.images' => ['array'],
            'faces.*.images.*.name' => ['required', 'string', 'max:200'],
            'faces.*.images.*.image' => ['sometimes', 'nullable', 'array'],
            'faces.*.images.*.imageClosed' => ['sometimes', 'nullable', 'array'],
            'faces.*.mouths' => ['array'],
            'faces.*.mouths.*.name' => ['required', 'string', 'max:200'],
            // Nullable as well as present: Laravel converts empty request strings to null, so an
            // unfilled mouth arrives as null rather than "". Both mean "no nodes yet".
            'faces.*.mouths.*.nodes' => ['present', 'nullable', 'string', 'max:2000'],
            'faces.*.mouths.*.color' => ['nullable', 'string', 'max:9'],
            'faces.*.eyesOpen' => ['nullable', 'string', 'max:2000'],
            'faces.*.eyesClosed' => ['nullable', 'string', 'max:2000'],
            'faces.*.eyesOpen2' => ['nullable', 'string', 'max:2000'],
            'faces.*.eyesClosed2' => ['nullable', 'string', 'max:2000'],
            'faces.*.eyesOpen3' => ['nullable', 'string', 'max:2000'],
            'faces.*.eyesClosed3' => ['nullable', 'string', 'max:2000'],
            'faces.*.outline' => ['nullable', 'string', 'max:2000'],
            'faces.*.outline2' => ['nullable', 'string', 'max:2000'],
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

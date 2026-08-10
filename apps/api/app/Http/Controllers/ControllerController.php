<?php

namespace App\Http\Controllers;

use App\Models\Controller as ControllerModel;
use App\Models\Project;
use Illuminate\Http\Request;

// Aliased above - App\Http\Controllers\Controller (this class's own parent) collides with
// App\Models\Controller in the same file otherwise. See DECISIONS.md M11.
class ControllerController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $project->authorize($request->user());

        return $project->controllers()->orderBy('name')->get();
    }

    public function store(Request $request, Project $project)
    {
        $project->authorize($request->user(), 'editor');

        $data = $request->validate([
            'name' => ['required', 'string'],
            'protocol' => ['required', 'string', 'in:ddp,ethernet,null,usb'],
            'ip_address' => ['nullable', 'string'],
            'start_channel' => ['integer', 'min:1'],
            'channel_count' => ['integer', 'min:0'],
            'vendor' => ['nullable', 'string'],
            'model' => ['nullable', 'string'],
            'active' => ['boolean'],
        ]);

        return response()->json($project->controllers()->create($data), 201);
    }

    public function update(Request $request, ControllerModel $controller)
    {
        $controller->project->authorize($request->user(), 'editor');

        $data = $request->validate([
            'name' => ['sometimes', 'string'],
            'protocol' => ['sometimes', 'string', 'in:ddp,ethernet,null,usb'],
            'ip_address' => ['nullable', 'string'],
            'start_channel' => ['sometimes', 'integer', 'min:1'],
            'channel_count' => ['sometimes', 'integer', 'min:0'],
            'vendor' => ['nullable', 'string'],
            'model' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $controller->update($data);

        return $controller;
    }

    public function destroy(Request $request, ControllerModel $controller)
    {
        $controller->project->authorize($request->user(), 'editor');

        $controller->delete();

        return response()->noContent();
    }
}

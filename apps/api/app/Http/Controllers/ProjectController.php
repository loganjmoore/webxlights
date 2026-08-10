<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->projects()->latest()->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $project = $request->user()->projects()->create($data);
        $project->layouts()->create(['name' => 'Layout']);

        return response()->json($project, 201);
    }

    public function show(Request $request, Project $project)
    {
        abort_unless($project->owner_id === $request->user()->id, 403);

        return $project;
    }
}

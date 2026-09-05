<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request)
    {
        // With how many sequences each holds: the home page says so on every card, which is
        // what tells two similarly named projects apart before opening either.
        $owned = $request->user()->projects()->withCount('sequences')->latest()->get();
        $shared = $request->user()->sharedProjects()->withCount('sequences')->latest()->get();

        return $owned->concat($shared)->values();
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
        $project->authorize($request->user());

        return $project;
    }
}

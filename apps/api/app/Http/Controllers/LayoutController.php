<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

class LayoutController extends Controller
{
    public function index(Request $request, Project $project)
    {
        abort_unless($project->owner_id === $request->user()->id, 403);

        // Backfill for projects created before layout auto-creation existed.
        if ($project->layouts()->doesntExist()) {
            $project->layouts()->create(['name' => 'Layout']);
        }

        return $project->layouts()->get();
    }
}

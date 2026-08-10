<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

class LayoutController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $project->authorize($request->user());

        // Backfill for projects created before layout auto-creation existed.
        if ($project->layouts()->doesntExist()) {
            $project->layouts()->create(['name' => 'Layout']);
        }

        return $project->layouts()->get();
    }
}

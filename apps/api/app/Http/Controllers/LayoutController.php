<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;

class LayoutController extends Controller
{
    public function index(Request $request, Project $project)
    {
        abort_unless($project->owner_id === $request->user()->id, 403);

        return $project->layouts()->get();
    }
}

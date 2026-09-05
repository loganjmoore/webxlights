<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectMemberController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $project->authorize($request->user());

        return $project->members()->with('user:id,name,email')->get();
    }

    // Share by email of an existing webXLights user. No invite-for-unregistered-email
    // flow (would need transactional email infra) - documented ceiling, see DECISIONS.md.
    public function store(Request $request, Project $project)
    {
        abort_unless($project->owner_id === $request->user()->id, 403);

        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', Rule::in(['viewer', 'editor'])],
        ]);

        $user = User::where('email', $data['email'])->first();
        abort_unless($user, 404, 'No pixl user with that email');
        abort_if($user->id === $project->owner_id, 422, 'Owner already has full access');

        $member = $project->members()->updateOrCreate(
            ['user_id' => $user->id],
            ['role' => $data['role']],
        );

        return response()->json($member->load('user:id,name,email'), 201);
    }

    public function destroy(Request $request, Project $project, User $user)
    {
        abort_unless($project->owner_id === $request->user()->id, 403);

        $project->members()->where('user_id', $user->id)->delete();

        return response()->noContent();
    }
}

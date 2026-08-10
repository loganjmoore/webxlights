<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Sequence;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SequenceController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $this->authorizeProject($request, $project);

        return $project->sequences()->latest()->get();
    }

    public function store(Request $request, Project $project)
    {
        $this->authorizeProject($request, $project);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'frame_ms' => ['required', 'integer', Rule::in([20, 25, 33, 40, 50])],
            'duration_ms' => ['required', 'integer', 'min:0'],
            'audio_filename' => ['nullable', 'string'],
        ]);

        $sequence = $project->sequences()->create($data + ['body' => ['timingTracks' => [], 'rows' => []]]);

        return response()->json($sequence, 201);
    }

    public function show(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence);

        return $sequence;
    }

    // Autosave target: PUT the whole body document. No ETag/optimistic-locking yet
    // (M7 hardens this) - last write wins, fine for a single-editor MVP.
    public function updateBody(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence);

        $data = $request->validate([
            'body' => ['required', 'array'],
        ]);

        $sequence->update(['body' => $data['body']]);

        return $sequence->fresh();
    }

    private function authorizeProject(Request $request, Project $project): void
    {
        abort_unless($project->owner_id === $request->user()->id, 403);
    }

    private function authorizeSequence(Request $request, Sequence $sequence): void
    {
        abort_unless($sequence->project->owner_id === $request->user()->id, 403);
    }
}

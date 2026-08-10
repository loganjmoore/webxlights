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
        $this->authorizeProject($request, $project, 'editor');

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

        return $this->withEtag($sequence);
    }

    // Autosave target: PUT the whole body document. Optimistic-locking via
    // If-Match: the client must send back the etag it last read; a stale etag
    // means someone else saved since, so we 409 with the current state instead
    // of silently clobbering their edit (the "collaborate without clobbering" fix).
    public function updateBody(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence, 'editor');

        $data = $request->validate([
            'body' => ['required', 'array'],
            'if_match' => ['nullable', 'string'],
        ]);

        $ifMatch = $data['if_match'] ?? null;
        if ($ifMatch !== null && $ifMatch !== $this->etag($sequence)) {
            return response()->json(['message' => 'conflict', 'current' => $this->withEtag($sequence)], 409);
        }

        $sequence->update(['body' => $data['body'], 'revision' => $sequence->revision + 1]);

        return $this->withEtag($sequence->fresh());
    }

    private function etag(Sequence $sequence): string
    {
        return (string) $sequence->revision;
    }

    private function withEtag(Sequence $sequence): array
    {
        return $sequence->toArray() + ['etag' => $this->etag($sequence)];
    }

    private function authorizeProject(Request $request, Project $project, string $need = 'viewer'): void
    {
        $project->authorize($request->user(), $need);
    }

    private function authorizeSequence(Request $request, Sequence $sequence, string $need = 'viewer'): void
    {
        $sequence->project->authorize($request->user(), $need);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Sequence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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

    // Persists the raw audio file the browser already decoded (M2's AudioContext.decodeAudioData
    // flow is unchanged — this just adds server-side storage so the sequencer doesn't need to
    // re-prompt for the file after a reload). Stored on the 'audio' disk, never public; served
    // back only through audio() below, which re-checks project access.
    public function uploadAudio(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence, 'editor');

        $request->validate(['audio' => ['required', 'file', 'max:51200']]); // 50MB

        if ($sequence->audio_path) {
            Storage::disk('audio')->delete($sequence->audio_path);
        }

        $path = $request->file('audio')->store("sequences/{$sequence->id}", 'audio');
        $sequence->update(['audio_path' => $path]);

        return $this->withEtag($sequence->fresh());
    }

    public function audio(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence);

        abort_if(!$sequence->audio_path || !Storage::disk('audio')->exists($sequence->audio_path), 404);

        return Storage::disk('audio')->response($sequence->audio_path);
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

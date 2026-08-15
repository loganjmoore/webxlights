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
            // An animated sequence has no soundtrack, which is the whole distinction - so the
            // type has to be settable at creation, not only afterwards.
            'sequence_type' => ['sometimes', Rule::in(['media', 'animated'])],
            'blend_between_models' => ['sometimes', 'boolean'],
        ]);

        $sequence = $project->sequences()->create($data + ['body' => ['timingTracks' => [], 'rows' => []]]);

        return response()->json($sequence, 201);
    }

    public function show(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence);

        return $this->withEtag($sequence);
    }

    /**
     * xLights' Sequence Settings dialog (File > Sequence Settings).
     *
     * Separate from updateBody deliberately: the body is autosaved on every edit and carries an
     * optimistic-locking etag, where these are deliberate changes made in a dialog. Sharing an
     * endpoint would mean every autosave had to resend the settings, and a stale settings copy
     * would then quietly overwrite someone else's change to them.
     */
    public function updateSettings(Request $request, Sequence $sequence)
    {
        $this->authorizeSequence($request, $sequence, 'editor');

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            // The same frame rates the create endpoint allows - a sequence rendered at a rate the
            // exporter doesn't know about would produce an .fseq nothing can play.
            'frame_ms' => ['sometimes', 'required', 'integer', Rule::in([20, 25, 33, 40, 50])],
            'duration_ms' => ['sometimes', 'required', 'integer', 'min:0'],
            'sequence_type' => ['sometimes', 'required', Rule::in(['media', 'animated'])],
            'blend_between_models' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'metadata.author' => ['nullable', 'string', 'max:255'],
            'metadata.email' => ['nullable', 'string', 'max:255'],
            'metadata.website' => ['nullable', 'string', 'max:255'],
            'metadata.song' => ['nullable', 'string', 'max:255'],
            'metadata.artist' => ['nullable', 'string', 'max:255'],
            'metadata.album' => ['nullable', 'string', 'max:255'],
            'metadata.music_url' => ['nullable', 'string', 'max:255'],
            'metadata.comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $sequence->update($data);

        return $this->withEtag($sequence->fresh());
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

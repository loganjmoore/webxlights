<?php

namespace App\Http\Controllers;

use App\Models\Media;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// A project's files. Audio is what a sequence is set to; images feed the Pictures effect.
// Everything is stored on the 'audio' disk (the persistent disk in prod) and served back only
// through file() below, which re-checks project access.
class MediaController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $project->authorize($request->user());

        return $project->media()
            ->with('sequences:id,name,audio_path,project_id')
            ->latest('id')
            ->get()
            ->map(fn (Media $m) => $this->summary($m));
    }

    public function store(Request $request, Project $project)
    {
        $project->authorize($request->user(), 'editor');

        // The same 50MB ceiling as a sequence's audio, and an extension allow-list because the
        // file is served back from this origin: an uploaded .html would be a stored script
        // running as the app.
        $request->validate([
            'file' => ['required', 'file', 'max:51200', 'extensions:'.implode(',', array_merge(Media::AUDIO_EXTENSIONS, Media::IMAGE_EXTENSIONS))],
        ]);

        $upload = $request->file('file');
        $path = $upload->store("media/{$project->id}", 'audio');
        $media = Media::record($project, $upload->getClientOriginalName(), $path, $upload->getClientMimeType(), $upload->getSize());

        return response()->json($this->summary($media->load('sequences:id,name,audio_path,project_id')), 201);
    }

    public function update(Request $request, Media $media)
    {
        $media->project->authorize($request->user(), 'editor');

        // Renaming changes the name in the list and nothing else: the stored path stays, so
        // every sequence pointing at the file keeps its soundtrack.
        $data = $request->validate(['name' => ['required', 'string', 'max:255']]);
        $media->update($data);

        return $this->summary($media->load('sequences:id,name,audio_path,project_id'));
    }

    public function destroy(Request $request, Media $media)
    {
        $media->project->authorize($request->user(), 'editor');

        $used = $media->sequences()->pluck('name');
        if ($used->isNotEmpty()) {
            return response()->json([
                'message' => 'This file is the soundtrack of '.$used->join(', ').'. Change or delete those sequences first.',
                'used_by' => $used,
            ], 409);
        }

        // Only if nothing else still calls the same path its own: two rows can share a path
        // (a legacy soundtrack recorded twice), and the file must outlive all but the last.
        if (! Media::where('path', $media->path)->where('id', '!=', $media->id)->exists()) {
            Storage::disk('audio')->delete($media->path);
        }
        $media->delete();

        return response()->noContent();
    }

    public function file(Request $request, Media $media)
    {
        $media->project->authorize($request->user());

        abort_if(! Storage::disk('audio')->exists($media->path), 404);

        return Storage::disk('audio')->response($media->path, $media->filename, [
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }

    private function summary(Media $media): array
    {
        return [
            'id' => $media->id,
            'project_id' => $media->project_id,
            'kind' => $media->kind,
            'name' => $media->name,
            'filename' => $media->filename,
            'mime' => $media->mime,
            'size_bytes' => $media->size_bytes,
            'used_by' => $media->sequences->map(fn ($s) => ['id' => $s->id, 'name' => $s->name])->values(),
            'created_at' => $media->created_at,
            'updated_at' => $media->updated_at,
        ];
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\LibrarySequence;
use App\Models\ModelEntity;
use App\Models\ModelGroup;
use App\Models\Media;
use App\Models\Project;
use App\Models\Sequence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * The shared sequence library, in the spirit of the sequence-sharing sites xLights users trade
 * on: publish a sequence, browse everyone's, and copy one onto your own layout - the browser maps
 * its models onto yours with the same dialog an xsq import uses, and the copy lands in your
 * project ready to preview.
 *
 * A published entry is a frozen copy, not a link: editing the original afterwards does not change
 * what people download. Audio is copied only when the publisher confirms they may share it.
 */
class LibraryController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'sort' => ['nullable', 'in:recent,popular'],
            'mine' => ['nullable', 'boolean'],
        ]);
        $query = LibrarySequence::query()->with('author:id,name');
        if ($data['mine'] ?? false) {
            $query->where('user_id', $request->user()->id);
        }
        if ($q = trim($data['q'] ?? '')) {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';
            $query->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('description', 'like', $like));
        }
        $query->orderByDesc(($data['sort'] ?? 'recent') === 'popular' ? 'uses' : 'id');

        return $query->paginate(24)->through(fn (LibrarySequence $s) => $this->summary($s));
    }

    public function show(Request $request, LibrarySequence $library)
    {
        return $this->summary($library) + ['body' => $library->body];
    }

    /** Freezes a sequence into the library, with the names its rows were written for. */
    public function publish(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user(), 'editor');
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:4000'],
            'include_audio' => ['sometimes', 'boolean'],
        ]);
        $body = $sequence->body ?? ['rows' => [], 'timingTracks' => []];
        $rows = collect($body['rows'] ?? [])->filter(fn ($r) => ! empty($r['effects']));
        if ($rows->isEmpty()) {
            return response()->json(['message' => 'This sequence has no effects yet; there is nothing to share.'], 422);
        }

        $entry = LibrarySequence::create([
            'user_id' => $request->user()->id,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'body' => $body,
            'donors' => $this->donors($sequence->project, $rows->values()->all()),
            'frame_ms' => $sequence->frame_ms,
            'duration_ms' => $sequence->duration_ms,
            'audio_filename' => $sequence->audio_filename,
        ]);
        // Copied, not referenced: the original sequence can be deleted or get a new song later.
        if (($data['include_audio'] ?? false) && $sequence->audio_path && Storage::disk('audio')->exists($sequence->audio_path)) {
            $ext = pathinfo($sequence->audio_path, PATHINFO_EXTENSION);
            $path = "library/{$entry->id}/audio".($ext ? ".{$ext}" : '');
            Storage::disk('audio')->copy($sequence->audio_path, $path);
            $entry->update(['audio_path' => $path]);
        }

        return response()->json($this->summary($entry->fresh('author')), 201);
    }

    /** A copy in one of the caller's projects, rows already mapped onto that project's models by the browser. */
    public function copy(Request $request, LibrarySequence $library)
    {
        $data = $request->validate([
            'project_id' => ['required', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'body' => ['required', 'array'],
            'body.rows' => ['present', 'array'],
            'body.timingTracks' => ['present', 'array'],
        ]);
        $project = Project::findOrFail($data['project_id']);
        $project->authorize($request->user(), 'editor');

        $sequence = $project->sequences()->create([
            'name' => $data['name'],
            'frame_ms' => $library->frame_ms,
            'duration_ms' => $library->duration_ms,
            'audio_filename' => $library->audio_filename,
            'body' => $data['body'],
        ]);
        if ($library->audio_path && Storage::disk('audio')->exists($library->audio_path)) {
            $ext = pathinfo($library->audio_path, PATHINFO_EXTENSION);
            $path = "sequences/{$sequence->id}/".($library->audio_filename ?: 'audio'.($ext ? ".{$ext}" : ''));
            Storage::disk('audio')->copy($library->audio_path, $path);
            $sequence->update(['audio_path' => $path]);
            Media::record($project, $library->audio_filename ?: basename($path), $path);
        }
        $library->increment('uses');

        return response()->json($sequence->fresh(), 201);
    }

    public function destroy(Request $request, LibrarySequence $library)
    {
        abort_unless($library->user_id === $request->user()->id, 403);
        if ($library->audio_path) {
            Storage::disk('audio')->delete($library->audio_path);
        }
        $library->delete();

        return response()->noContent();
    }

    public function audio(Request $request, LibrarySequence $library)
    {
        abort_if(! $library->audio_path || ! Storage::disk('audio')->exists($library->audio_path), 404);

        return Storage::disk('audio')->response($library->audio_path, null, [
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }

    /**
     * The rows as the publisher's layout names them. A row references a model or group by id;
     * ids mean nothing in another project, so the name (and the model's type, which helps a
     * person choose) travels with the entry.
     */
    private function donors(Project $project, array $rows): array
    {
        $layoutIds = $project->layouts()->pluck('id');
        $models = ModelEntity::whereIn('layout_id', $layoutIds)->get(['id', 'name', 'type'])->keyBy('id');
        $groups = ModelGroup::whereIn('layout_id', $layoutIds)->get(['id', 'name'])->keyBy('id');
        $donors = [];
        foreach ($rows as $row) {
            $type = $row['elementType'] ?? 'model';
            $id = (int) ($row['elementId'] ?? 0);
            if ($type === 'model' && isset($models[$id])) {
                $donors[] = ['name' => $models[$id]->name, 'elementType' => 'model', 'elementId' => $id, 'type' => $models[$id]->type, 'effectCount' => count($row['effects'])];
            } elseif ($type === 'group' && isset($groups[$id])) {
                $donors[] = ['name' => $groups[$id]->name, 'elementType' => 'group', 'elementId' => $id, 'type' => 'Group', 'effectCount' => count($row['effects'])];
            }
            // Sub-model and strand rows stay inside the body but cannot be mapped by name alone.
        }

        return $donors;
    }

    private function summary(LibrarySequence $s): array
    {
        return [
            'id' => $s->id,
            'title' => $s->title,
            'description' => $s->description,
            'author' => $s->author ? ['id' => $s->author->id, 'name' => $s->author->name] : null,
            'user_id' => $s->user_id,
            'frame_ms' => $s->frame_ms,
            'duration_ms' => $s->duration_ms,
            'audio_filename' => $s->audio_filename,
            'has_audio' => $s->audio_path !== null,
            'donors' => $s->donors,
            'timing_track_names' => array_values(array_map(fn ($t) => $t['name'], $s->body['timingTracks'] ?? [])),
            'uses' => $s->uses,
            'created_at' => $s->created_at?->toIso8601String(),
        ];
    }
}

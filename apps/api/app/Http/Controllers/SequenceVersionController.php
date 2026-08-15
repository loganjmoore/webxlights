<?php

namespace App\Http\Controllers;

use App\Models\Sequence;
use App\Models\SequenceVersion;
use Illuminate\Http\Request;

class SequenceVersionController extends Controller
{
    public function index(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user());

        return $sequence->versions()->latest('number')->with('creator:id,name')->get();
    }

    // Snapshot the sequence's current body as a new immutable version.
    public function store(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user(), 'editor');

        $number = ($sequence->versions()->max('number') ?? 0) + 1;

        $version = $sequence->versions()->create([
            'number' => $number,
            'body' => $sequence->body,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($version, 201);
    }

    /**
     * Deletes snapshots older than a number of days (xLights' Settings > Backup > "Purge Backups
     * Older Than", offering Never / 365 / 90 / 31 / 7).
     *
     * Nothing purged history before this: every snapshot ever taken was kept, and with autosave
     * driving them a season's editing accumulates a full copy of the sequence body every few
     * minutes. Retention had no expression at all.
     *
     * The most recent snapshot is always kept, whatever its age. A retention rule that could empty
     * the history entirely turns "keep less" into "keep nothing", and the one thing a backup has
     * to survive is not being used for a while.
     */
    public function purge(Request $request, Sequence $sequence)
    {
        $sequence->project->authorize($request->user(), 'editor');

        $data = $request->validate([
            'older_than_days' => ['required', 'integer', 'min:1'],
        ]);

        $newest = $sequence->versions()->max('number');
        $deleted = $sequence->versions()
            ->where('created_at', '<', now()->subDays($data['older_than_days']))
            ->where('number', '!=', $newest)
            ->delete();

        return response()->json(['deleted' => $deleted]);
    }

    /** Deletes one snapshot outright, which is the manual half of the same job. */
    public function destroy(Request $request, Sequence $sequence, int $version)
    {
        $sequence->project->authorize($request->user(), 'editor');

        $deleted = $sequence->versions()->where('number', $version)->delete();

        return response()->json(['deleted' => $deleted]);
    }

    // Restore overwrites the sequence's live body with a prior snapshot's body
    // (itself snapshottable afterwards — restoring never deletes history).
    public function restore(Request $request, Sequence $sequence, SequenceVersion $version)
    {
        $sequence->project->authorize($request->user(), 'editor');
        abort_unless($version->sequence_id === $sequence->id, 404);

        $sequence->update(['body' => $version->body, 'revision' => $sequence->revision + 1]);

        return $sequence->fresh();
    }
}

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

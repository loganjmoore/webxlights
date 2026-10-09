<?php

namespace App\Http\Controllers;

use App\Models\MagicFeedback;
use App\Models\Sequence;
use App\Services\Magic\RoleEffects;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Somebody sharing what they changed in a Magic Sequence, so the effect picker can learn from it.
// Only ever sent when they press Share; the shape is checked tightly so nothing but counts, roles
// and section summaries can be stored.
class MagicFeedbackController extends Controller
{
    public function store(Request $request, Sequence $sequence)
    {
        $user = $request->user();
        $sequence->project->authorize($user, 'editor');
        $payload = $request->validate([
            'v' => ['required', 'integer', Rule::in([1])],
            'style' => ['required', Rule::in(['show', 'mood', 'classic'])],
            'feel' => ['required', Rule::in(['auto', 'traditional', 'joyful', 'peaceful', 'powerful', 'magical', 'rock'])],
            'bpm' => ['required', 'numeric', 'between:40,250'],
            'sections' => ['required', 'array', 'min:1', 'max:64'],
            'sections.*.label' => ['required', Rule::in(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'breakdown', 'solo', 'outro'])],
            'sections.*.energy' => ['required', 'numeric', 'between:0,1'],
            'sections.*.bars' => ['required', 'integer', 'min:1', 'max:1000'],
            'rows' => ['required', 'array', 'min:1', 'max:300'],
            'rows.*.role' => ['required', Rule::in(array_keys(RoleEffects::table()))],
            'rows.*.tier' => ['required', Rule::in(['hero', 'feature', 'frame', 'fill'])],
            'rows.*.placed' => ['present', 'array', 'max:40'],
            'rows.*.placed.*' => ['integer', 'min:0', 'max:100000'],
            'rows.*.now' => ['present', 'array', 'max:40'],
            'rows.*.now.*' => ['integer', 'min:0', 'max:100000'],
        ]);
        // Effect names are the keys of placed and now: names only, nothing free-form.
        foreach ($payload['rows'] as $i => $row) {
            foreach ([...array_keys($row['placed']), ...array_keys($row['now'])] as $name) {
                if (! is_string($name) || ! preg_match('/^[A-Za-z][A-Za-z ]{0,39}$/', $name)) {
                    return response()->json(['message' => 'Effect names only.', 'errors' => ["rows.$i" => ['Effect names only.']]], 422);
                }
            }
        }

        $feedback = MagicFeedback::updateOrCreate(['user_id' => $user->id, 'sequence_id' => $sequence->id], ['payload' => $payload]);

        return response()->json(['shared' => true], $feedback->wasRecentlyCreated ? 201 : 200);
    }
}

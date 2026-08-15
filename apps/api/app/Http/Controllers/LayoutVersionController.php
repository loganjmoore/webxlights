<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use App\Models\LayoutVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Layout snapshots, the layout's answer to sequence versions.
//
// xLights' periodic backup covers the layout as well as the sequences; here only sequences had any
// history at all, so a mis-drag or a bad import was unrecoverable. This mirrors
// SequenceVersionController deliberately - same shape, same restore-is-not-destructive-to-history
// rule - rather than inventing a second mechanism to learn.
class LayoutVersionController extends Controller
{
    /** How many automatic snapshots to keep. Manual ones are never pruned. */
    private const AUTO_KEEP = 20;

    public function index(Request $request, Layout $layout)
    {
        $layout->project->authorize($request->user());

        // Without the snapshot bodies: a list of twenty layouts would be megabytes, and the list
        // is only ever used to choose one.
        return $layout->versions()
            ->latest('number')
            ->with('creator:id,name')
            ->get(['id', 'layout_id', 'number', 'reason', 'created_by', 'created_at', 'updated_at']);
    }

    public function store(Request $request, Layout $layout)
    {
        $layout->project->authorize($request->user(), 'editor');
        $data = $request->validate(['reason' => ['sometimes', 'string', 'in:manual,auto']]);
        $reason = $data['reason'] ?? 'manual';

        $number = ($layout->versions()->max('number') ?? 0) + 1;

        $version = $layout->versions()->create([
            'number' => $number,
            'snapshot' => $this->snapshot($layout),
            'reason' => $reason,
            'created_by' => $request->user()->id,
        ]);

        if ($reason === 'auto') {
            $this->pruneAuto($layout);
        }

        return response()->json($version->only(['id', 'layout_id', 'number', 'reason', 'created_at']), 201);
    }

    /**
     * Restores a snapshot over the live layout.
     *
     * Matched by *name*, not by id: a model's id is what every sequence body points at, so
     * recreating models wholesale would leave every sequence in the project addressing rows that
     * no longer exist. Restoring by name keeps those ids for everything that existed when the
     * snapshot was taken, which is the case that matters.
     *
     * Models added since the snapshot are removed, because a restore that left them would not be
     * the layout that was snapshotted - it would be a merge, which is a different thing and one
     * nobody asked for.
     */
    public function restore(Request $request, Layout $layout, LayoutVersion $version)
    {
        $layout->project->authorize($request->user(), 'editor');
        abort_unless($version->layout_id === $layout->id, 404);

        $snapshot = $version->snapshot;

        DB::transaction(function () use ($layout, $snapshot) {
            $keptModels = [];
            foreach ($snapshot['models'] ?? [] as $m) {
                $model = $layout->models()->updateOrCreate(['name' => $m['name']], collect($m)->except('name')->all());
                $keptModels[] = $model->id;
            }
            $layout->models()->whereNotIn('id', $keptModels ?: [0])->delete();

            $keptGroups = [];
            foreach ($snapshot['groups'] ?? [] as $g) {
                $group = $layout->modelGroups()->updateOrCreate(
                    ['name' => $g['name']],
                    ['buffer_style' => $g['buffer_style'] ?? null, 'params' => $g['params'] ?? []],
                );
                $memberIds = $layout->models()->whereIn('name', $g['memberNames'] ?? [])->pluck('id', 'name');
                $group->members()->sync(
                    collect($g['memberNames'] ?? [])
                        ->filter(fn ($name) => isset($memberIds[$name]))
                        ->values()
                        ->mapWithKeys(fn ($name, $i) => [$memberIds[$name] => ['order' => $i]])
                        ->all(),
                );
                $keptGroups[] = $group->id;
            }
            $layout->modelGroups()->whereNotIn('id', $keptGroups ?: [0])->delete();

            $keptObjects = [];
            foreach ($snapshot['viewObjects'] ?? [] as $o) {
                $object = $layout->viewObjects()->updateOrCreate(['name' => $o['name']], collect($o)->except('name')->all());
                $keptObjects[] = $object->id;
            }
            $layout->viewObjects()->whereNotIn('id', $keptObjects ?: [0])->delete();

            $layout->update(['settings' => $snapshot['settings'] ?? []]);
        });

        return $layout->fresh();
    }

    /** Everything that makes a layout what it is, in the shape the restore reads back. */
    private function snapshot(Layout $layout): array
    {
        return [
            'models' => $layout->models()->get()->map(fn ($m) => collect($m->toArray())
                ->except(['id', 'layout_id', 'created_at', 'updated_at'])
                ->all())->all(),
            'groups' => $layout->modelGroups()->with('members:id,name')->get()->map(fn ($g) => [
                'name' => $g->name,
                'buffer_style' => $g->buffer_style,
                'params' => $g->params,
                'memberNames' => $g->members->pluck('name')->all(),
            ])->all(),
            'viewObjects' => $layout->viewObjects()->get()->map(fn ($o) => collect($o->toArray())
                ->except(['id', 'layout_id', 'created_at', 'updated_at'])
                ->all())->all(),
            // Views, effect presets and the backdrop all live here.
            'settings' => $layout->settings ?? [],
        ];
    }

    /** Keeps the most recent automatic snapshots and drops the rest. Manual ones are untouched. */
    private function pruneAuto(Layout $layout): void
    {
        $ids = $layout->versions()
            ->where('reason', 'auto')
            ->latest('number')
            ->skip(self::AUTO_KEEP)
            ->take(PHP_INT_MAX)
            ->pluck('id');

        if ($ids->isNotEmpty()) {
            LayoutVersion::whereIn('id', $ids)->delete();
        }
    }
}

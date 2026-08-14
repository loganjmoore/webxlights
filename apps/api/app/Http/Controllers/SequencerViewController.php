<?php

namespace App\Http\Controllers;

use App\Models\Layout;
use Illuminate\Http\Request;

/**
 * xLights' Views (manual: Sequencer > Views). "A view is used to be able to easily select a list
 * of models and the sequence in which they are to be displayed on the sequencer."
 *
 * Stored on the layout rather than on a sequence, because that is what the manual says they are:
 * "views work across sequences, so once you have setup a view with the models that you require,
 * if you open any sequence, that view is available to use in that sequence". A per-sequence copy
 * would have to be duplicated into every new sequence and would drift apart from the moment a
 * model was renamed.
 *
 * They live in the layout's existing `settings` JSON rather than earning a table: a view is a
 * name and an ordered list of row keys, it is only ever read and written whole, and nothing else
 * ever joins against one.
 */
class SequencerViewController extends Controller
{
    public function index(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout);

        return ['views' => $this->viewsOf($layout)];
    }

    public function replace(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout, 'editor');

        $data = $request->validate([
            'views' => ['present', 'array'],
            'views.*.name' => ['required', 'string', 'max:200'],
            // A row key identifies a sequencer row - a model, a group, or a model's sub-model -
            // and is opaque here. The client owns that format; the server only keeps the order.
            'views.*.rowKeys' => ['array'],
            'views.*.rowKeys.*' => ['string', 'max:400'],
        ]);

        $views = [];
        foreach ($data['views'] as $view) {
            $views[] = [
                'name' => $view['name'],
                'rowKeys' => array_values(array_unique($view['rowKeys'] ?? [])),
            ];
        }

        $settings = $layout->settings ?? [];
        $settings['views'] = $views;
        $layout->update(['settings' => $settings]);

        return ['views' => $views];
    }

    // The same three-liner the other layout-scoped controllers use: a layout's permissions are
    // its project's.
    private function authorizeLayout(Request $request, Layout $layout, string $need = 'viewer'): void
    {
        $layout->project->authorize($request->user(), $need);
    }

    private function viewsOf(Layout $layout): array
    {
        $views = ($layout->settings ?? [])['views'] ?? [];

        return is_array($views) ? array_values($views) : [];
    }
}

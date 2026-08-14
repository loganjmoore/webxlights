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

    /**
     * xLights' Effect Presets (manual: Sequencer > Effect Presets). Saved effect configurations,
     * organised into named groups, so an effect can be reused "without recreating them from
     * scratch".
     *
     * Stored beside the views and for the same reasons: presets are global in xLights rather than
     * belonging to one sequence, they are only ever read and written whole, and nothing joins
     * against one.
     */
    public function presets(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout);

        $presets = ($layout->settings ?? [])['effectPresets'] ?? [];

        return ['presets' => is_array($presets) ? array_values($presets) : []];
    }

    public function replacePresets(Request $request, Layout $layout)
    {
        $this->authorizeLayout($request, $layout, 'editor');

        $request->validate([
            'presets' => ['present', 'array'],
            'presets.*.name' => ['required', 'string', 'max:200'],
            'presets.*.group' => ['required', 'string', 'max:200'],
            'presets.*.durationMs' => ['required', 'integer', 'min:1'],
            // The effect's own configuration. Its shape belongs to the engine, and validating it
            // field by field here would mean changing this endpoint every time an effect gained a
            // parameter - so only the one field without which a preset can't render is required.
            'presets.*.settings' => ['required', 'array'],
            'presets.*.settings.name' => ['required', 'string'],
        ]);

        // Read from the raw input rather than the validator's return: `validate()` gives back only
        // the keys that have rules, so taking `settings` from there would silently drop every
        // effect parameter and leave presets that applied as bare defaults.
        $presets = [];
        foreach ((array) $request->input('presets', []) as $preset) {
            $presets[] = [
                'name' => $preset['name'],
                'group' => $preset['group'],
                'durationMs' => (int) $preset['durationMs'],
                'settings' => $preset['settings'],
            ];
        }

        $settings = $layout->settings ?? [];
        $settings['effectPresets'] = $presets;
        $layout->update(['settings' => $settings]);

        return ['presets' => $presets];
    }

    private function viewsOf(Layout $layout): array
    {
        $views = ($layout->settings ?? [])['views'] ?? [];

        return is_array($views) ? array_values($views) : [];
    }
}

<?php

namespace Tests\Feature;

use App\Models\Layout;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SequencerViewsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    private function layoutFor(User $user): Layout
    {
        $project = Project::factory()->create(['owner_id' => $user->id]);

        return $project->layouts()->create(['name' => 'Layout']);
    }

    public function test_a_layout_starts_with_no_views(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)
            ->getJson("/api/v1/layouts/{$layout->id}/views")
            ->assertOk()
            ->assertExactJson(['views' => []]);
    }

    public function test_views_round_trip_with_their_row_order_intact(): void
    {
        // "A view is used to be able to easily select a list of models *and the sequence in which
        // they are to be displayed*" - the order is the feature, so it has to survive the trip.
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", [
            'views' => [
                ['name' => 'Mega Tree Only', 'rowKeys' => ['model:3', 'model:1']],
                ['name' => 'Roofline', 'rowKeys' => ['group:2']],
            ],
        ])->assertOk();

        $this->actingAs($user)
            ->getJson("/api/v1/layouts/{$layout->id}/views")
            ->assertOk()
            ->assertJsonPath('views.0.name', 'Mega Tree Only')
            ->assertJsonPath('views.0.rowKeys', ['model:3', 'model:1'])
            ->assertJsonPath('views.1.name', 'Roofline');
    }

    public function test_a_row_listed_twice_in_one_view_is_kept_once(): void
    {
        // A row can't be in a view twice - it would render its effects twice and appear as two
        // rows of the same model.
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", [
            'views' => [['name' => 'Dupes', 'rowKeys' => ['model:1', 'model:1', 'model:2']]],
        ])->assertOk()->assertJsonPath('views.0.rowKeys', ['model:1', 'model:2']);
    }

    public function test_replacing_with_an_empty_list_clears_the_views(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", [
            'views' => [['name' => 'Temporary', 'rowKeys' => []]],
        ])->assertOk();

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", ['views' => []])
            ->assertOk()
            ->assertExactJson(['views' => []]);
    }

    public function test_views_do_not_disturb_the_rest_of_a_layouts_settings(): void
    {
        // They ride in the layout's existing settings JSON rather than earning a table, so the
        // write has to be a merge - clobbering the whole column would lose anything else in it.
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);
        $layout->update(['settings' => ['backgroundImage' => 'house.png']]);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", [
            'views' => [['name' => 'All', 'rowKeys' => ['model:1']]],
        ])->assertOk();

        $this->assertSame('house.png', $layout->fresh()->settings['backgroundImage']);
    }

    public function test_a_stranger_cannot_read_or_write_another_projects_views(): void
    {
        $owner = User::factory()->create();
        $layout = $this->layoutFor($owner);
        $stranger = User::factory()->create();

        $this->actingAs($stranger)->getJson("/api/v1/layouts/{$layout->id}/views")->assertForbidden();
        $this->actingAs($stranger)
            ->putJson("/api/v1/layouts/{$layout->id}/views", ['views' => []])
            ->assertForbidden();
    }

    public function test_effect_presets_round_trip_with_their_settings_intact(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/effect-presets", [
            'presets' => [[
                'name' => 'Slow Spiral',
                'group' => 'Spirals',
                'durationMs' => 2000,
                'settings' => ['name' => 'Spirals', 'params' => ['paletteRep' => 2], 'blendMode' => 'Additive'],
            ]],
        ])->assertOk();

        $this->actingAs($user)
            ->getJson("/api/v1/layouts/{$layout->id}/effect-presets")
            ->assertOk()
            ->assertJsonPath('presets.0.group', 'Spirals')
            ->assertJsonPath('presets.0.settings.params.paletteRep', 2)
            ->assertJsonPath('presets.0.settings.blendMode', 'Additive');
    }

    public function test_presets_and_views_do_not_overwrite_each_other(): void
    {
        // They share the layout's settings column, so each write has to merge rather than
        // replace - otherwise saving a preset would silently delete every view.
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/views", [
            'views' => [['name' => 'All', 'rowKeys' => ['model:1']]],
        ])->assertOk();

        $this->actingAs($user)->putJson("/api/v1/layouts/{$layout->id}/effect-presets", [
            'presets' => [['name' => 'P', 'group' => 'G', 'durationMs' => 500, 'settings' => ['name' => 'On']]],
        ])->assertOk();

        $this->actingAs($user)
            ->getJson("/api/v1/layouts/{$layout->id}/views")
            ->assertJsonPath('views.0.name', 'All');
    }

    public function test_a_preset_with_no_effect_name_is_rejected(): void
    {
        // Without one there is nothing to render, and the preset would apply as a blank effect.
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)
            ->putJson("/api/v1/layouts/{$layout->id}/effect-presets", [
                'presets' => [['name' => 'P', 'group' => 'G', 'durationMs' => 500, 'settings' => ['params' => []]]],
            ])
            ->assertStatus(422);
    }

    public function test_a_view_without_a_name_is_rejected(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)
            ->putJson("/api/v1/layouts/{$layout->id}/views", ['views' => [['rowKeys' => ['model:1']]]])
            ->assertStatus(422);
    }
}

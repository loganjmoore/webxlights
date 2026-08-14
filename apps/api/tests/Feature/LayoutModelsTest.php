<?php

namespace Tests\Feature;

use App\Models\Layout;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LayoutModelsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    public function test_creating_a_project_auto_creates_a_layout(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->postJson('/api/v1/projects', ['name' => 'Show']);
        $projectId = $response->json('id');

        $layouts = $this->actingAs($user)->getJson("/api/v1/projects/{$projectId}/layouts");
        $layouts->assertOk()->assertJsonCount(1)->assertJsonPath('0.name', 'Layout');
    }

    public function test_a_project_without_a_layout_gets_one_backfilled_on_first_fetch(): void
    {
        $user = User::factory()->create();
        // Simulate a project created before layout auto-creation existed (bypasses the
        // controller's ->layouts()->create() side effect).
        $project = Project::factory()->for($user, 'owner')->create(['name' => 'Legacy Show']);
        $this->assertCount(0, $project->layouts);

        $response = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/layouts");
        $response->assertOk()->assertJsonCount(1)->assertJsonPath('0.name', 'Layout');

        // Idempotent: fetching again doesn't create a second one.
        $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/layouts")->assertJsonCount(1);
    }

    public function test_bulk_upsert_imports_models_and_is_idempotent_by_name(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();

        $payload = [
            'models' => [
                [
                    'name' => 'Mega Tree',
                    'type' => 'Tree',
                    'supported' => true,
                    'params' => ['strings' => 16, 'nodesPerString' => 50],
                    'raw_attrs' => ['NumStrings' => '16', 'NodesPerString' => '50'],
                    'screen' => ['x' => 100, 'y' => 200],
                    'strings' => 16,
                    'nodes_per_string' => 50,
                ],
                [
                    'name' => 'Spinner Prop',
                    'type' => 'Spinner',
                    'supported' => false,
                    'params' => [],
                    'raw_attrs' => ['NumStrings' => '4'],
                    'screen' => [],
                ],
            ],
        ];

        $first = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", $payload);
        $first->assertCreated()->assertJsonCount(2);

        $list = $this->actingAs($user)->getJson("/api/v1/layouts/{$layout->id}/models");
        $list->assertOk()->assertJsonCount(2);
        $unsupported = collect($list->json())->firstWhere('name', 'Spinner Prop');
        $this->assertFalse($unsupported['supported']);

        // Re-importing the same file must not duplicate rows (idempotent by name).
        $second = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", $payload);
        $second->assertCreated();
        $this->assertCount(2, $layout->fresh()->models);
    }

    public function test_bulk_upsert_groups_resolves_members_by_name(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [
                ['name' => 'Arch 1', 'type' => 'Arches', 'params' => [], 'raw_attrs' => []],
                ['name' => 'Arch 2', 'type' => 'Arches', 'params' => [], 'raw_attrs' => []],
            ],
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/model-groups/bulk", [
            'groups' => [
                ['name' => 'Front Yard', 'memberNames' => ['Arch 1', 'Arch 2', 'Unknown Model']],
            ],
        ]);

        $response->assertCreated();
        $members = $response->json('0.members');
        $this->assertCount(2, $members); // "Unknown Model" silently dropped, not a 500
    }

    public function test_bulk_upsert_view_objects_and_lists_them(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();

        $response = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", [
            'objects' => [
                ['name' => 'Gridlines', 'type' => 'Gridlines', 'supported' => true, 'raw_attrs' => ['GridWidth' => '2500']],
                ['name' => 'Mesh', 'type' => 'Mesh', 'supported' => false, 'raw_attrs' => ['ObjFile' => '/x/house.obj']],
            ],
        ]);
        $response->assertCreated();

        $list = $this->actingAs($user)->getJson("/api/v1/layouts/{$layout->id}/view-objects");
        $list->assertOk()->assertJsonCount(2);
        $this->assertSame('2500', collect($list->json())->firstWhere('name', 'Gridlines')['raw_attrs']['GridWidth']);
        $this->assertFalse(collect($list->json())->firstWhere('name', 'Mesh')['supported']);
    }

    public function test_sub_models_can_be_edited_on_a_model(): void
    {
        // The in-app sub-model editor. Until this, sub-models could only arrive by importing an
        // xlights_rgbeffects.xml - there was no way to make one, or to fix one that came in wrong.
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $model = $layout->models()->create(['name' => 'Mega Tree', 'type' => 'Tree', 'supported' => true]);

        $this->actingAs($user)->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
            'sub_models' => [
                ['name' => 'Star', 'type' => 'ranges', 'rows' => ['1-25'], 'vertical' => false],
                ['name' => 'Top Half', 'type' => 'subbuffer', 'subBuffer' => '0,50,100,100'],
            ],
        ])->assertOk();

        $fresh = $model->fresh();
        $this->assertCount(2, $fresh->sub_models);
        $this->assertSame('Star', $fresh->sub_models[0]['name']);
        $this->assertSame(['1-25'], $fresh->sub_models[0]['rows']);
        $this->assertSame('0,50,100,100', $fresh->sub_models[1]['subBuffer']);
    }

    public function test_a_sub_model_with_an_unknown_type_is_rejected(): void
    {
        // Only the two kinds the engine can resolve. Anything else would import, save, and then
        // render as nothing - which looks like the effects on that row were lost.
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $model = $layout->models()->create(['name' => 'Mega Tree', 'type' => 'Tree', 'supported' => true]);

        $this->actingAs($user)
            ->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
                'sub_models' => [['name' => 'Odd', 'type' => 'something-else']],
            ])
            ->assertStatus(422);
    }

    public function test_states_can_be_edited_on_a_model(): void
    {
        // The in-app state editor. A state is a named set of the model's nodes that the State
        // effect turns on by name, and the whole feature is unusable without somewhere to define
        // them - importing is the only other route in.
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $model = $layout->models()->create(['name' => 'Bruno', 'type' => 'Custom', 'supported' => true]);

        $this->actingAs($user)->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
            'states' => [
                [
                    'name' => 'State1',
                    'entries' => [
                        ['name' => 'wink', 'nodes' => '1,5,8', 'color' => '#ff0000'],
                        ['name' => 'blink', 'nodes' => '1-2,5,8'],
                    ],
                ],
            ],
        ])->assertOk();

        $fresh = $model->fresh();
        $this->assertCount(1, $fresh->states);
        // The whole definition survives the round trip - the earlier preset bug was exactly this:
        // rules on the nested keys only, and Laravel returning nothing for the parent.
        $this->assertSame('wink', $fresh->states[0]['entries'][0]['name']);
        $this->assertSame('1,5,8', $fresh->states[0]['entries'][0]['nodes']);
        $this->assertSame('#ff0000', $fresh->states[0]['entries'][0]['color']);
        $this->assertArrayNotHasKey('color', $fresh->states[0]['entries'][1]);
    }

    public function test_a_state_without_node_ranges_is_rejected(): void
    {
        // A state that names no nodes turns nothing on, so it would save and then look like the
        // effect was broken rather than the definition.
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $model = $layout->models()->create(['name' => 'Bruno', 'type' => 'Custom', 'supported' => true]);

        $this->actingAs($user)
            ->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
                'states' => [['name' => 'State1', 'entries' => [['name' => 'wink']]]],
            ])
            ->assertStatus(422);
    }

    public function test_bulk_import_carries_state_definitions(): void
    {
        // States arrive from an xlights_rgbeffects.xml the same way sub-models do.
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [[
                'name' => 'Bruno',
                'type' => 'Custom',
                'states' => [['name' => 'State1', 'entries' => [['name' => 'wink', 'nodes' => '1,5,8']]]],
            ]],
        ])->assertCreated();

        $model = $layout->fresh()->models->firstWhere('name', 'Bruno');
        $this->assertSame('wink', $model->states[0]['entries'][0]['name']);
    }

    public function test_deleting_a_model_group_removes_it(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();
        $bulk = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/model-groups/bulk", [
            'groups' => [['name' => 'Front Yard', 'memberNames' => []]],
        ]);
        $groupId = $bulk->json('0.id');

        $this->actingAs($user)->deleteJson("/api/v1/layouts/{$layout->id}/model-groups/{$groupId}")->assertNoContent();
        $this->assertCount(0, $layout->fresh()->modelGroups);
    }

    public function test_a_user_cannot_touch_another_users_layout(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $layout = Layout::factory()->for($owner->projects()->create(['name' => 'Show']))->create();

        $this->actingAs($intruder)->getJson("/api/v1/layouts/{$layout->id}/models")->assertForbidden();
    }

    public function test_updating_raw_attrs_persists_structural_properties(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();
        $bulk = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [['name' => 'Tree-1', 'type' => 'Tree', 'params' => [], 'raw_attrs' => ['NumStrings' => '16']]],
        ]);
        $modelId = $bulk->json('0.id');

        $response = $this->actingAs($user)->patchJson("/api/v1/layouts/{$layout->id}/models/{$modelId}", [
            'raw_attrs' => ['NumStrings' => '16', 'NodesPerString' => '75', 'TreeDegrees' => '270'],
        ]);

        $response->assertOk()->assertJsonPath('raw_attrs.NodesPerString', '75')->assertJsonPath('raw_attrs.TreeDegrees', '270');
    }

    public function test_deleting_a_model_removes_it(): void
    {
        $user = User::factory()->create();
        $layout = Layout::factory()->for($user->projects()->create(['name' => 'Show']))->create();

        $bulk = $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [['name' => 'Tree-1', 'type' => 'Tree', 'params' => [], 'raw_attrs' => []]],
        ]);
        $modelId = $bulk->json('0.id');

        $this->actingAs($user)->deleteJson("/api/v1/layouts/{$layout->id}/models/{$modelId}")->assertNoContent();
        $this->assertCount(0, $layout->fresh()->models);
    }

    public function test_deleting_a_model_from_the_wrong_layout_404s(): void
    {
        $user = User::factory()->create();
        $layoutA = Layout::factory()->for($user->projects()->create(['name' => 'Show A']))->create();
        $layoutB = Layout::factory()->for($user->projects()->create(['name' => 'Show B']))->create();

        $bulk = $this->actingAs($user)->postJson("/api/v1/layouts/{$layoutA->id}/models/bulk", [
            'models' => [['name' => 'Tree-1', 'type' => 'Tree', 'params' => [], 'raw_attrs' => []]],
        ]);
        $modelId = $bulk->json('0.id');

        $this->actingAs($user)->deleteJson("/api/v1/layouts/{$layoutB->id}/models/{$modelId}")->assertNotFound();
    }
}

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

    public function test_a_user_cannot_touch_another_users_layout(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $layout = Layout::factory()->for($owner->projects()->create(['name' => 'Show']))->create();

        $this->actingAs($intruder)->getJson("/api/v1/layouts/{$layout->id}/models")->assertForbidden();
    }
}

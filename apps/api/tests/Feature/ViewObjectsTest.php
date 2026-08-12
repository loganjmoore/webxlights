<?php

namespace Tests\Feature;

use App\Models\Layout;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// M15.7 shipped ViewObjectController with no coverage at all. These are the tests that should
// have come with it: the index endpoint every Layout page calls on load, the bulk upsert the
// importer calls, and the authorization gate both share.
class ViewObjectsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    private function layoutFor(User $user): Layout
    {
        $project = Project::factory()->for($user, 'owner')->create();

        return $project->layouts()->create(['name' => 'Layout']);
    }

    // The exact request the Layout page makes on every load. It returned 500 in production for
    // two hours because the table behind it had never been created - the code deployed, the
    // migration didn't.
    public function test_index_returns_an_empty_list_for_a_layout_with_no_view_objects(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)
            ->getJson("/api/v1/layouts/{$layout->id}/view-objects")
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_bulk_upsert_imports_view_objects_and_index_returns_them(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", [
            'objects' => [
                [
                    'name' => 'Gridlines',
                    'type' => 'Gridlines',
                    'supported' => true,
                    'raw_attrs' => ['GridLineSpacing' => '50', 'GridWidth' => '2500', 'Active' => 'true'],
                ],
                ['name' => 'Terrain', 'type' => 'Terrain', 'supported' => false, 'raw_attrs' => []],
            ],
        ])->assertCreated();

        $response = $this->actingAs($user)->getJson("/api/v1/layouts/{$layout->id}/view-objects");
        $response->assertOk()->assertJsonCount(2);
        $response->assertJsonPath('0.name', 'Gridlines');
        $response->assertJsonPath('0.supported', true);
        // raw_attrs is lossless - the importer keeps every attribute, supported type or not
        $response->assertJsonPath('0.raw_attrs.GridWidth', '2500');
        $response->assertJsonPath('1.supported', false);
    }

    // Re-importing the same show must not duplicate its helper objects.
    public function test_bulk_upsert_is_idempotent_by_name_within_a_layout(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);
        $payload = ['objects' => [['name' => 'Gridlines', 'type' => 'Gridlines', 'supported' => true, 'raw_attrs' => ['GridWidth' => '2500']]]];

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", $payload)->assertCreated();
        $payload['objects'][0]['raw_attrs'] = ['GridWidth' => '3000'];
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", $payload)->assertCreated();

        $response = $this->actingAs($user)->getJson("/api/v1/layouts/{$layout->id}/view-objects");
        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonPath('0.raw_attrs.GridWidth', '3000');
    }

    public function test_a_stranger_cannot_read_or_write_another_users_view_objects(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $layout = $this->layoutFor($owner);

        $this->actingAs($stranger)->getJson("/api/v1/layouts/{$layout->id}/view-objects")->assertForbidden();
        $this->actingAs($stranger)->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", [
            'objects' => [['name' => 'Gridlines', 'type' => 'Gridlines']],
        ])->assertForbidden();
    }

    public function test_bulk_upsert_rejects_objects_without_a_name_or_type(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutFor($user);

        $this->actingAs($user)
            ->postJson("/api/v1/layouts/{$layout->id}/view-objects/bulk", ['objects' => [['type' => 'Gridlines']]])
            ->assertStatus(422);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Layout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ControllersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    public function test_a_user_can_create_list_update_and_delete_a_controller(): void
    {
        $user = User::factory()->create();
        $project = $user->projects()->create(['name' => 'Show']);

        $create = $this->actingAs($user)->postJson("/api/v1/projects/{$project->id}/controllers", [
            'name' => 'Front Yard DDP',
            'protocol' => 'ddp',
            'ip_address' => '192.168.1.50',
            'start_channel' => 1,
            'channel_count' => 5000,
        ]);
        $create->assertCreated()->assertJsonPath('name', 'Front Yard DDP');
        $controllerId = $create->json('id');

        $list = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/controllers");
        $list->assertOk()->assertJsonCount(1);

        $update = $this->actingAs($user)->patchJson("/api/v1/controllers/{$controllerId}", ['channel_count' => 6000]);
        $update->assertOk()->assertJsonPath('channel_count', 6000);

        $this->actingAs($user)->deleteJson("/api/v1/controllers/{$controllerId}")->assertNoContent();
        $this->assertCount(0, $project->controllers()->get());
    }

    public function test_a_user_cannot_touch_another_users_controller(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = $owner->projects()->create(['name' => 'Show']);
        $controller = $project->controllers()->create(['name' => 'Rig', 'protocol' => 'ddp', 'channel_count' => 1000]);

        $this->actingAs($intruder)->getJson("/api/v1/projects/{$project->id}/controllers")->assertForbidden();
        $this->actingAs($intruder)->patchJson("/api/v1/controllers/{$controller->id}", ['name' => 'Hijacked'])->assertForbidden();
        $this->actingAs($intruder)->deleteJson("/api/v1/controllers/{$controller->id}")->assertForbidden();
    }

    public function test_assigning_a_model_within_the_controllers_span_succeeds(): void
    {
        $user = User::factory()->create();
        $project = $user->projects()->create(['name' => 'Show']);
        $layout = Layout::factory()->for($project)->create();
        $controller = $project->controllers()->create(['name' => 'Rig', 'protocol' => 'ddp', 'start_channel' => 1, 'channel_count' => 300]);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [['name' => 'Tree', 'type' => 'Tree', 'params' => [], 'raw_attrs' => []]],
        ]);
        $model = $layout->models()->first();

        $response = $this->actingAs($user)->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
            'controller_id' => $controller->id,
            'controller_offset' => 0,
            'channel_count' => 150,
        ]);

        $response->assertOk()->assertJsonPath('controller_id', $controller->id);
    }

    public function test_assigning_a_model_past_the_controllers_span_is_rejected_with_422(): void
    {
        $user = User::factory()->create();
        $project = $user->projects()->create(['name' => 'Show']);
        $layout = Layout::factory()->for($project)->create();
        $controller = $project->controllers()->create(['name' => 'Rig', 'protocol' => 'ddp', 'start_channel' => 1, 'channel_count' => 100]);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/models/bulk", [
            'models' => [['name' => 'Tree', 'type' => 'Tree', 'params' => [], 'raw_attrs' => []]],
        ]);
        $model = $layout->models()->first();

        // offset 50 + 150 channels = 200, past the controller's 100-channel span
        $response = $this->actingAs($user)->patchJson("/api/v1/layouts/{$layout->id}/models/{$model->id}", [
            'controller_id' => $controller->id,
            'controller_offset' => 50,
            'channel_count' => 150,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('controller_offset');
        $this->assertNull($model->fresh()->controller_id); // rejected at save time, not silently clamped
    }
}

<?php
namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HouseDraftTest extends TestCase
{
    use RefreshDatabase;

    public function test_removed_generation_cannot_call_providers_or_change_saved_layouts(): void
    {
        Http::preventStrayRequests();
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $house = json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
        $settings = ['keep' => 'yes', 'houseModel' => $house];
        $layout = $project->layouts()->create(['name' => 'House', 'settings' => $settings]);
        $this->actingAs($user);
        $base = "/api/v1/layouts/{$layout->id}/house-model";
        foreach (['lookup', 'generate'] as $action) {
            $this->postJson("$base/$action", ['photos' => ['old-tab-photo']])->assertStatus(410)
                ->assertJsonPath('message', 'Model my house has been removed. Reload the page to continue.');
        }
        Http::assertNothingSent();
        $this->assertSame(0, $user->creditTransactions()->count());
        $this->assertEquals($settings, $layout->fresh()->settings);
        $this->getJson($base)->assertOk()->assertJsonPath('houseModel', $house);
    }

    public function test_stale_revision_cannot_overwrite_a_saved_house(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'House']);
        $base = "/api/v1/layouts/{$layout->id}/house-model";
        $this->actingAs($user);
        $revision = $this->getJson($base)->assertOk()->json('revision');
        $house = json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
        $this->putJson($base, ['houseModel' => $house, 'if_match' => $revision])->assertOk();
        $this->putJson($base, ['houseModel' => null, 'if_match' => $revision])->assertConflict();
        $this->assertEquals($house, $layout->fresh()->settings['houseModel']);
    }
}

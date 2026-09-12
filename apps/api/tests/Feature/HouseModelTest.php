<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HouseModelTest extends TestCase
{
    use RefreshDatabase;

    private function house(): array
    {
        return json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
    }

    public function test_house_persists_and_restores_without_disturbing_light_models_or_other_settings(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout', 'settings' => ['views' => [['name' => 'Front', 'rowKeys' => []]]]]);
        $model = $layout->models()->create(['name' => 'Tree', 'type' => 'Tree', 'supported' => true]);
        $url = "/api/v1/layouts/{$layout->id}/house-model";
        $this->actingAs($user)->putJson($url, ['houseModel' => $this->house()])->assertOk();
        $this->getJson("/api/v1/projects/{$project->id}/layouts")->assertOk()->assertJsonPath('0.settings.houseModel.source.label', $this->house()['source']['label']);
        $this->assertEquals($this->house(), $layout->fresh()->settings['houseModel']);
        $version = $this->postJson("/api/v1/layouts/{$layout->id}/versions")->assertCreated()->json('id');
        $this->putJson($url, ['houseModel' => null])->assertOk()->assertExactJson(['houseModel' => null]);
        $this->assertArrayNotHasKey('houseModel', $layout->fresh()->settings);
        $this->assertSame('Front', $layout->fresh()->settings['views'][0]['name']);
        $this->assertSame($model->id, $layout->fresh()->models->first()->id);
        $this->postJson("/api/v1/layouts/{$layout->id}/versions/{$version}/restore")->assertOk();
        $this->assertEquals($this->house(), $layout->fresh()->settings['houseModel']);
    }

    public function test_only_editors_can_write_and_strangers_cannot_read_the_house(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $owner->id]);
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $url = "/api/v1/layouts/{$layout->id}/house-model";
        $this->actingAs($viewer)->putJson($url, ['houseModel' => $this->house()])->assertForbidden();
        $project->members()->where('user_id', $viewer->id)->update(['role' => 'editor']);
        $this->putJson($url, ['houseModel' => $this->house()])->assertOk();
        $this->actingAs(User::factory()->create())->putJson($url, ['houseModel' => null])->assertForbidden();
        $this->getJson("/api/v1/projects/{$project->id}/layouts")->assertForbidden();
    }

    public function test_bad_geometry_is_rejected_without_replacing_the_saved_house(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout']);
        $url = "/api/v1/layouts/{$layout->id}/house-model";
        $this->actingAs($user)->putJson($url, ['houseModel' => $this->house()])->assertOk();
        foreach ([[[0,0,0],[0,0,0],[1,0,0]], [[0,0,0],[1,0,0]], [[0,0,0],[1,0,0],[0,1001,0]]] as $vertices) {
            $house = $this->house();
            $house['surfaces'][0]['vertices'] = $vertices;
            $this->putJson($url, ['houseModel' => $house])->assertUnprocessable();
        }
        $house = $this->house();
        $house['placement']['worldUnitsPerMeter'] = 0;
        $this->putJson($url, ['houseModel' => $house])->assertUnprocessable();
        $house = $this->house();
        $house['surfaces'] = array_fill(0, 257, $house['surfaces'][0]);
        $this->putJson($url, ['houseModel' => $house])->assertUnprocessable();
        $this->putJson($url, [])->assertUnprocessable();
        $this->putJson($url, ['houseModel' => []])->assertUnprocessable();
        $this->putJson($url, ['houseModel' => (object) []])->assertUnprocessable();
        $this->assertEquals($this->house(), $layout->fresh()->settings['houseModel']);
    }
}

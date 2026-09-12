<?php
namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use App\Services\HouseSources;
use App\Services\HouseGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class HouseDraftTest extends TestCase
{
    use RefreshDatabase;

    private function setupHouse(): array
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['services.house.key' => 'test-key', 'services.house.monthly_limit' => 1]);
        Http::preventStrayRequests();
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'House', 'settings' => ['keep' => 'yes']]);
        $this->actingAs($user);
        $sources = $this->mock(HouseSources::class);
        $sources->shouldReceive('search')->andReturn([['label' => '123 Main Street', 'name' => '', 'lat' => 41, 'lng' => -87]]);
        $sources->shouldReceive('building')->andReturn([]);
        $base = "/api/v1/layouts/{$layout->id}/house-model";
        $token = $this->postJson("$base/lookup", ['address' => '123 Main Street'])->assertOk()->json('candidates.0.token');
        return [$user, $layout, $base, $token, $sources];
    }

    public function test_generation_is_private_idempotent_and_does_not_save_until_reviewed(): void
    {
        [$user, $layout, $base, $token, $sources] = $this->setupHouse();
        $sources->shouldReceive('streetPhotos')->once()->andReturn([['dataUrl' => 'test']]);
        $house = json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
        $this->mock(HouseGenerator::class)->shouldReceive('generate')->once()->andReturn(['houseModel' => $house, 'evidence' => 'Test', 'missing' => [], 'photos' => []]);
        $request = ['token' => $token, 'requestId' => (string) Str::uuid()];
        $this->postJson("$base/generate", $request)->assertOk()->assertJsonPath('houseModel.source.label', $house['source']['label']);
        $this->postJson("$base/generate", $request)->assertOk();
        $this->assertSame(['keep' => 'yes'], $layout->fresh()->settings);
        $this->assertSame(1, $user->creditTransactions()->where('reason', 'house_generation')->count());
        $request['photos'] = ['changed'];
        $this->postJson("$base/generate", $request)->assertConflict();
    }

    public function test_missing_photos_never_spends_generation_allowance(): void
    {
        [$user, $layout, $base, $token, $sources] = $this->setupHouse();
        $sources->shouldReceive('streetPhotos')->andReturn([]);
        $sources->shouldReceive('commonsPhotos')->andReturn([]);
        $this->postJson("$base/generate", ['token' => $token, 'requestId' => (string) Str::uuid()])->assertUnprocessable()->assertJsonPath('message', 'No usable public house photos were found for this address. Add your own front and side photos below, then generate again.');
        $this->assertSame(0, $user->creditTransactions()->count());
        $this->assertSame(['keep' => 'yes'], $layout->fresh()->settings);
    }

    public function test_editor_scope_and_monthly_limit_are_enforced_before_paid_generation(): void
    {
        [$user, $layout, $base, $token, $sources] = $this->setupHouse();
        $sources->shouldReceive('streetPhotos')->andReturn([['dataUrl' => 'test']]);
        $user->moveCredits(0, 'house_generation');
        $this->postJson("$base/generate", ['token' => $token, 'requestId' => (string) Str::uuid()])->assertStatus(429);
        $viewer = User::factory()->create();
        $layout->project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);
        $this->actingAs($viewer)->postJson("$base/lookup", ['address' => '123 Main Street'])->assertForbidden();
        $layout->project->members()->where('user_id', $viewer->id)->update(['role' => 'editor']);
        $this->postJson("$base/generate", ['token' => $token, 'requestId' => (string) Str::uuid()])->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_stale_revision_cannot_overwrite_a_new_house(): void
    {
        [$user, $layout, $base] = $this->setupHouse();
        $revision = $this->getJson($base)->assertOk()->json('revision');
        $house = json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
        $this->putJson($base, ['houseModel' => $house, 'if_match' => $revision])->assertOk();
        $this->putJson($base, ['houseModel' => null, 'if_match' => $revision])->assertConflict();
        $this->assertEquals($house, $layout->fresh()->settings['houseModel']);
    }

    public function test_lookup_and_generation_have_independent_rate_limits(): void
    {
        config(['services.house.key' => 'test-key']);
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'House']);
        $sources = $this->mock(HouseSources::class);
        $sources->shouldReceive('search')->andReturn([]);
        $sources->shouldReceive('building')->andReturn([]);
        $base = "/api/v1/layouts/{$layout->id}/house-model";
        $this->actingAs($user);
        for ($i=0; $i<3; $i++) {
            $token = $this->postJson("$base/lookup", ['address' => '123 Unmapped Lane'])->assertOk()->json('candidates.0.token');
            $this->postJson("$base/generate", ['token' => $token, 'requestId' => (string) Str::uuid()])->assertUnprocessable();
        }
        $this->postJson("$base/generate", ['token' => $token, 'requestId' => (string) Str::uuid()])->assertStatus(429);
        $this->postJson("$base/lookup", ['address' => '123 Unmapped Lane'])->assertOk();
    }

    public function test_unmapped_addresses_can_use_own_photos_without_guessing_a_location(): void
    {
        config(['services.house.key' => 'test-key']);
        Http::fake(['*' => Http::response(['features' => []])]);
        $user = User::factory()->create();
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'House']);
        $base = "/api/v1/layouts/{$layout->id}/house-model";
        $token = $this->actingAs($user)->postJson("$base/lookup", ['address' => '123 Unmapped Lane'])->assertOk()->json('candidates.0.token');
        $request = ['token' => $token, 'requestId' => (string) Str::uuid()];
        $this->postJson("$base/generate", $request)->assertUnprocessable()->assertJsonPath('message', 'This address is not mapped yet. Add your own front and side photos below to model this house.');
        $request['photos'] = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='];
        $this->mock(HouseGenerator::class)->shouldReceive('generate')->once()->withArgs(fn($p,$b,$photos) => $p['lat'] === null && $p['lng'] === null && $b === [] && count($photos) === 1)->andReturn(['houseModel' => [], 'evidence' => 'Test', 'missing' => [], 'photos' => []]);
        $this->postJson("$base/generate", $request)->assertOk();
        Http::assertSentCount(1);
    }

    public function test_real_tool_shape_is_preserved_and_zero_area_padding_is_removed(): void
    {
        config(['services.house.key' => 'test-key']);
        $house = json_decode(file_get_contents(base_path('../web/test/fixtures/synthetic-house.json')), true);
        $surfaces = array_map(fn($s) => array_intersect_key($s, array_flip(['name','kind','vertices'])), $house['surfaces']);
        array_push($surfaces[0]['vertices'], [0,0,0], [0,0,0], [0,0,0]);
        Http::fake(['api.anthropic.com/*' => Http::response(['stop_reason' => 'tool_use', 'content' => [['type' => 'tool_use', 'name' => 'house_exterior', 'input' => ['targetIdentified' => true, 'evidence' => 'Exact house photo', 'notes' => 'Estimated', 'missing' => [], 'surfaces' => $surfaces]]]])]);
        $result = (new HouseGenerator())->generate(['label' => '123 Main', 'name' => '', 'lat' => 41, 'lng' => -87], [], []);
        $this->assertEquals($house['surfaces'], $result['houseModel']['surfaces']);
        $this->assertSame('123 Main', $result['houseModel']['source']['label']);
        Http::assertSent(fn($r) => $r['tools'][0]['strict'] === true);
    }

    public function test_model_refusals_and_invalid_geometry_are_not_accepted(): void
    {
        config(['services.house.key' => 'test-key']);
        $generator = new HouseGenerator();
        $place = ['label' => '123 Main', 'name' => '', 'lat' => 41, 'lng' => -87];
        foreach ([false, true] as $identified) {
            Http::swap(new \Illuminate\Http\Client\Factory());
            Http::fake(['api.anthropic.com/*' => Http::response(['stop_reason' => 'tool_use', 'content' => [['type' => 'tool_use', 'name' => 'house_exterior', 'input' => ['targetIdentified' => $identified, 'evidence' => 'Unclear', 'notes' => '', 'missing' => [], 'surfaces' => []]]]])]);
            try { $generator->generate($place, [], []); $this->fail('Invalid model accepted'); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame($identified ? 502 : 422, $e->getStatusCode()); }
        }
    }
}

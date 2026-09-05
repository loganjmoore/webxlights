<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ShaderGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The per-day cap on server-funded generations.
 *
 * Credits bound what one user can ever spend; the 10-a-minute throttle stops a burst; this
 * bounds the operator's worst-case daily bill, which is what makes "fund a shared key with $100
 * and let people generate for free" a plan rather than a hope. The arithmetic behind the
 * default lives in docs/SHADER-ASSISTANT-COST.md.
 */
class ShaderDailyLimitTest extends TestCase
{
    use RefreshDatabase;

    private function fakeGenerator(): object
    {
        $fake = new class extends ShaderGenerator
        {
            public int $calls = 0;

            public function __construct() {}

            public function generate(
                string $description,
                ?string $previousSource = null,
                ?string $repairing = null,
                ?string $userKey = null,
                ?string $providerName = null,
                ?string $modelName = null,
                ?string $target = null,
            ): array {
                $this->calls++;

                return ['source' => "/*{}*/\nvoid main(){}", 'usage' => []];
            }
        };
        $this->instance(ShaderGenerator::class, $fake);

        return $fake;
    }

    public function test_the_cap_stops_the_generation_after_the_limit_without_spending(): void
    {
        config(['services.shader.daily_limit' => 2]);
        $fake = $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 10]);

        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'snow'])->assertOk();
        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'fire'])->assertOk();

        $response = $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'stars']);

        $response->assertStatus(429)->assertJsonPath('code', 'daily_limit');
        // The refusal says when to come back - a limit with no reset time reads as a ban.
        $this->assertNotNull($response->json('resets_at'));
        // Refused before anything moved: two paid generations, not three, and no third API call.
        $this->assertSame(8, $user->fresh()->credits);
        $this->assertSame(2, $fake->calls);
    }

    public function test_bringing_your_own_key_bypasses_the_cap(): void
    {
        config(['services.shader.daily_limit' => 1]);
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 10]);

        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'snow'])->assertOk();

        // Over the server-funded limit now - but their key is their bill, so no cap applies.
        $this->actingAs($user)
            ->withHeader('X-Shader-Key', 'sk-ant-their-own')
            ->postJson('/api/v1/shaders/generate', ['description' => 'fire'])
            ->assertOk();
    }

    public function test_a_refunded_generation_gives_the_daily_slot_back(): void
    {
        config(['services.shader.daily_limit' => 2]);
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 10]);

        // A failed call: charged then refunded. The user got nothing, so it must not count.
        $user->moveCredits(-1, 'shader_generation');
        $user->moveCredits(1, 'refund');
        $user->moveCredits(-1, 'shader_generation');

        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'snow'])->assertOk();
    }

    public function test_zero_turns_the_cap_off(): void
    {
        config(['services.shader.daily_limit' => 0]);
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 10]);

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => "shader {$i}"])->assertOk();
        }
    }

    public function test_the_credits_endpoint_reports_the_cap_and_todays_use(): void
    {
        config(['services.shader.daily_limit' => 40]);
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 10]);
        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'snow'])->assertOk();

        $this->actingAs($user)->getJson('/api/v1/credits')
            ->assertOk()
            ->assertJsonPath('daily_limit', 40)
            ->assertJsonPath('used_today', 1);
    }
}

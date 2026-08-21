<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ShaderGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ShaderCreditsTest extends TestCase
{
    use RefreshDatabase;

    /** A generator that answers without going near the network, and remembers the key it got. */
    private function fakeGenerator(string $source = "/*{}*/\nvoid main(){}"): object
    {
        $fake = new class($source) extends ShaderGenerator
        {
            public ?string $sawKey = null;

            public ?string $sawProvider = null;

            public bool $called = false;

            public function __construct(private string $answer) {}

            public function generate(
                string $description,
                ?string $previousSource = null,
                ?string $repairing = null,
                ?string $userKey = null,
                ?string $providerName = null,
                ?string $modelName = null,
            ): array {
                $this->called = true;
                $this->sawKey = $userKey;
                $this->sawProvider = $providerName;

                return ['source' => $this->answer, 'usage' => []];
            }
        };
        $this->instance(ShaderGenerator::class, $fake);

        return $fake;
    }

    public function test_a_new_account_can_try_the_assistant_without_paying(): void
    {
        // A generator you cannot use until you have paid is one nobody discovers they want.
        // fresh(), because the column default is applied by the database on insert and is not
        // reflected in the in-memory model the factory hands back.
        $this->assertGreaterThan(0, User::factory()->create()->fresh()->credits);
    }

    public function test_generating_spends_a_credit_and_returns_the_shader(): void
    {
        $this->fakeGenerator("/*{}*/\nvoid main(){ gl_FragColor = vec4(1.0); }");
        $user = User::factory()->create(['credits' => 3]);

        $response = $this->actingAs($user)->postJson('/api/v1/shaders/generate', [
            'description' => 'swirling fire',
        ]);

        $response->assertOk()->assertJsonPath('credits', 2);
        $this->assertStringContainsString('void main', $response->json('source'));
        $this->assertSame(2, $user->fresh()->credits);
    }

    public function test_the_ledger_records_every_movement(): void
    {
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 5]);
        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'aurora']);

        // The balance is a cache of the ledger, so the two have to agree - a balance with no
        // ledger row behind it makes "why do I have 4 credits" unanswerable.
        $this->assertDatabaseHas('credit_transactions', [
            'user_id' => $user->id,
            'amount' => -1,
            'reason' => 'shader_generation',
            'balance_after' => 4,
        ]);
    }

    public function test_an_empty_balance_is_refused_rather_than_going_negative(): void
    {
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 0]);

        $this->actingAs($user)
            ->postJson('/api/v1/shaders/generate', ['description' => 'anything'])
            ->assertStatus(402)
            ->assertJsonPath('code', 'insufficient_credits');

        $this->assertSame(0, $user->fresh()->credits);
    }

    public function test_a_failed_generation_gives_the_credit_back(): void
    {
        $this->instance(ShaderGenerator::class, new class extends ShaderGenerator
        {
            public function generate(
                string $description,
                ?string $previousSource = null,
                ?string $repairing = null,
                ?string $userKey = null,
                ?string $providerName = null,
                ?string $modelName = null,
            ): array {
                throw new RuntimeException('No API key is configured for the shader assistant.');
            }
        });

        $user = User::factory()->create(['credits' => 2]);
        $this->actingAs($user)
            ->postJson('/api/v1/shaders/generate', ['description' => 'anything'])
            ->assertStatus(503);

        // Charged then refunded, so the user is where they started and the ledger says why.
        $this->assertSame(2, $user->fresh()->credits);
        $this->assertDatabaseHas('credit_transactions', ['user_id' => $user->id, 'reason' => 'refund']);
    }

    public function test_credits_cannot_be_spent_twice_by_racing(): void
    {
        // The reason moveCredits locks the row. Two spends that each check the same starting
        // balance must not both succeed - otherwise the way to get a free generation is to
        // press the button twice.
        $user = User::factory()->create(['credits' => 1]);

        $first = $user->moveCredits(-1, 'shader_generation');
        $second = $user->moveCredits(-1, 'shader_generation');

        $this->assertTrue($first);
        $this->assertFalse($second);
        $this->assertSame(0, $user->fresh()->credits);
        $this->assertDatabaseCount('credit_transactions', 1);
    }

    public function test_a_refused_spend_writes_no_ledger_row(): void
    {
        $user = User::factory()->create(['credits' => 0]);
        $this->assertFalse($user->moveCredits(-1, 'shader_generation'));
        $this->assertDatabaseCount('credit_transactions', 0);
    }

    public function test_the_balance_endpoint_reports_the_ledger(): void
    {
        $user = User::factory()->create(['credits' => 4]);
        $user->moveCredits(-1, 'shader_generation');

        $this->actingAs($user)->getJson('/api/v1/credits')
            ->assertOk()
            ->assertJsonPath('credits', 3)
            ->assertJsonPath('cost_per_generation', 1)
            ->assertJsonPath('transactions.0.reason', 'shader_generation');
    }

    public function test_generation_requires_a_signed_in_user(): void
    {
        $this->postJson('/api/v1/shaders/generate', ['description' => 'x'])->assertUnauthorized();
    }

    public function test_a_user_who_brings_their_own_key_spends_no_credits(): void
    {
        $fake = $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 2]);

        $response = $this->actingAs($user)
            ->withHeader('X-Shader-Key', 'sk-ant-test-key')
            ->postJson('/api/v1/shaders/generate', ['description' => 'aurora']);

        // Their usage is billed to them by Anthropic, so it costs the operator nothing and
        // therefore costs no credits. This is what lets the project be open source without the
        // maintainer funding everybody's generations.
        $response->assertOk()->assertJsonPath('charged', false)->assertJsonPath('credits', 2);
        $this->assertSame(2, $user->fresh()->credits);
        $this->assertDatabaseCount('credit_transactions', 0);
        $this->assertSame('sk-ant-test-key', $fake->sawKey);
    }

    public function test_a_user_key_is_never_written_down(): void
    {
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 1]);
        $key = 'sk-ant-secret-value';

        $this->actingAs($user)
            ->withHeader('X-Shader-Key', $key)
            ->postJson('/api/v1/shaders/generate', ['description' => 'aurora'])
            ->assertOk();

        // Storing other people's API keys is a liability worth far more than the convenience of
        // not re-pasting one, so nothing anywhere may come to hold it.
        foreach (['users', 'credit_transactions', 'shaders'] as $table) {
            foreach (\DB::table($table)->get() as $row) {
                $this->assertStringNotContainsString($key, json_encode($row));
            }
        }
    }

    public function test_an_empty_balance_still_works_with_your_own_key(): void
    {
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 0]);

        // Running out of credits is not the end of the assistant - it is the point at which you
        // either buy some or bring your own key.
        $this->actingAs($user)
            ->withHeader('X-Shader-Key', 'sk-ant-test-key')
            ->postJson('/api/v1/shaders/generate', ['description' => 'aurora'])
            ->assertOk();
    }

    public function test_the_server_key_is_used_when_the_caller_brings_none(): void
    {
        $fake = $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 2]);

        $this->actingAs($user)->postJson('/api/v1/shaders/generate', ['description' => 'aurora'])->assertOk();

        $this->assertNull($fake->sawKey);
        $this->assertSame(1, $user->fresh()->credits);
    }

    public function test_an_operator_can_refuse_to_proxy_user_keys(): void
    {
        config(['services.shader.allow_user_keys' => false]);
        $this->fakeGenerator();
        $user = User::factory()->create(['credits' => 5]);

        $this->actingAs($user)
            ->withHeader('X-Shader-Key', 'sk-ant-test-key')
            ->postJson('/api/v1/shaders/generate', ['description' => 'aurora'])
            ->assertForbidden();

        // Refused before anything is charged.
        $this->assertSame(5, $user->fresh()->credits);
    }

    public function test_the_client_can_tell_which_kind_of_server_it_is_talking_to(): void
    {
        config(['services.shader.key' => null]);
        $user = User::factory()->create();

        // A self-hosted copy has no server key, so the UI has to ask for one rather than offer
        // credits. It finds that out from here instead of being configured to know.
        $this->actingAs($user)->getJson('/api/v1/credits')
            ->assertOk()
            ->assertJsonPath('server_key_available', false)
            ->assertJsonPath('accepts_user_keys', true);
    }
}

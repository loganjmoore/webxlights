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

    /** A generator that answers without going near the network. */
    private function fakeGenerator(string $source = "/*{}*/\nvoid main(){}"): void
    {
        $this->instance(ShaderGenerator::class, new class($source) extends ShaderGenerator
        {
            public function __construct(private string $answer)
            {
                parent::__construct();
            }

            public function generate(string $description, ?string $previousSource = null, ?string $repairing = null): array
            {
                return ['source' => $this->answer, 'usage' => []];
            }
        });
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
            public function __construct()
            {
                parent::__construct();
            }

            public function generate(string $description, ?string $previousSource = null, ?string $repairing = null): array
            {
                throw new RuntimeException('The shader assistant is not configured on this server.');
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
}

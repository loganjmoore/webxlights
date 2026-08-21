<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Shader\AnthropicDriver;
use App\Services\Shader\GeneratorDriver;
use App\Services\Shader\OpenAiCompatibleDriver;
use App\Services\Shader\Providers;
use App\Services\ShaderGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class ShaderProvidersTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_provider_resolves_to_a_driver_and_a_default_model(): void
    {
        foreach (Providers::all() as $name => $preset) {
            $this->assertTrue(
                is_subclass_of($preset['driver'], GeneratorDriver::class),
                "{$name} has no usable driver",
            );
            // "custom" has no default model on purpose - its whole point is that the operator
            // supplies one - so it is the only exception.
            if ($name !== 'custom') {
                $this->assertNotSame('', $preset['model'], "{$name} has no default model");
            }
        }
    }

    public function test_only_anthropic_needs_its_own_driver(): void
    {
        // The point of the whole arrangement: nearly every provider speaks OpenAI's
        // /chat/completions, so supporting a dozen of them is one driver and a base URL rather
        // than a dozen integrations.
        $drivers = array_unique(array_column(Providers::all(), 'driver'));
        $this->assertEqualsCanonicalizing([AnthropicDriver::class, OpenAiCompatibleDriver::class], $drivers);
    }

    public function test_an_unknown_provider_name_falls_back_rather_than_exploding(): void
    {
        // The name comes from an env var and from a request header; a typo should not be a 500.
        $this->assertSame(Providers::get('anthropic'), Providers::get('nonsense-provider'));
        $this->assertSame(Providers::get('anthropic'), Providers::get(null));
    }

    public function test_the_provider_list_leaks_no_endpoints_or_keys(): void
    {
        // This list is served to the browser, so it carries names and labels and nothing else.
        foreach (Providers::options() as $option) {
            $this->assertSame(['name', 'label'], array_keys($option));
        }
    }

    public function test_the_configured_provider_and_model_decide_what_is_used(): void
    {
        config(['services.shader.provider' => 'deepseek', 'services.shader.model' => null]);
        $resolved = app(ShaderGenerator::class)->resolve();
        $this->assertSame('deepseek', $resolved['provider']);
        // Falls through to the preset's default, so setting a key alone is enough to get going.
        $this->assertSame('deepseek-v4-flash', $resolved['model']);

        config(['services.shader.model' => 'deepseek-v4-pro']);
        $this->assertSame('deepseek-v4-pro', app(ShaderGenerator::class)->resolve()['model']);
    }

    public function test_a_caller_with_their_own_key_may_choose_their_own_provider(): void
    {
        config(['services.shader.provider' => 'anthropic']);
        // They are paying, so it is their choice.
        $resolved = app(ShaderGenerator::class)->resolve('gemini', 'gemini-2.5-flash-lite');
        $this->assertSame('gemini', $resolved['provider']);
        $this->assertSame('gemini-2.5-flash-lite', $resolved['model']);
    }

    public function test_an_openai_compatible_provider_is_called_in_the_shared_format(): void
    {
        Http::fake([
            'api.deepseek.com/*' => Http::response([
                'choices' => [['message' => ['content' => "/*{}*/\nvoid main(){}"]]],
                'usage' => ['prompt_tokens' => 700, 'completion_tokens' => 400],
            ]),
        ]);
        config([
            'services.shader.provider' => 'deepseek',
            'services.shader.base_url' => 'https://api.deepseek.com/v1',
            'services.shader.key' => 'sk-deepseek',
            'services.shader.model' => null,
        ]);

        $result = app(ShaderGenerator::class)->generate('swirling fire');

        $this->assertStringContainsString('void main', $result['source']);
        $this->assertSame('deepseek', $result['usage']['provider']);
        $this->assertSame(400, $result['usage']['output_tokens']);

        Http::assertSent(function ($request) {
            // A system message and a user message, the shape every one of these providers takes.
            return $request->url() === 'https://api.deepseek.com/v1/chat/completions'
                && $request['messages'][0]['role'] === 'system'
                && $request['messages'][1]['role'] === 'user'
                && $request->hasHeader('Authorization', 'Bearer sk-deepseek');
        });
    }

    public function test_a_model_that_rejects_max_tokens_gets_one_retry_with_the_renamed_field(): void
    {
        // OpenAI's newer models (the gpt-5 family) refuse `max_tokens` and demand
        // `max_completion_tokens`; nearly every other compatible provider only knows the old
        // name. The driver leads with the shared name and retries once when told otherwise -
        // found the hard way, when a freshly configured gpt-5-mini failed every generation.
        Http::fakeSequence('api.openai.com/*')
            ->push(['error' => ['message' => "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."]], 400)
            ->push([
                'choices' => [['message' => ['content' => "/*{}*/\nvoid main(){}"]]],
                'usage' => ['prompt_tokens' => 700, 'completion_tokens' => 400],
            ]);
        config([
            'services.shader.provider' => 'openai',
            'services.shader.base_url' => 'https://api.openai.com/v1',
            'services.shader.key' => 'sk-openai',
            'services.shader.model' => null,
        ]);

        $result = app(ShaderGenerator::class)->generate('swirling fire');

        $this->assertStringContainsString('void main', $result['source']);
        Http::assertSentCount(2);
        Http::assertSent(function ($request) {
            // The retry must carry the renamed field and not both - sending both is an error too.
            return ! isset($request['max_completion_tokens'])
                || (! isset($request['max_tokens']) && $request['max_completion_tokens'] === 8000);
        });
    }

    public function test_the_providers_own_error_reaches_the_caller(): void
    {
        Http::fake(['*' => Http::response(['error' => ['message' => 'Insufficient Balance']], 402)]);
        config([
            'services.shader.provider' => 'deepseek',
            'services.shader.base_url' => 'https://api.deepseek.com/v1',
            'services.shader.key' => 'sk-deepseek',
        ]);

        // "Insufficient balance" and "model not found" are both fixable by whoever is reading
        // the error - but only if they can see it.
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Insufficient Balance/');
        app(ShaderGenerator::class)->generate('anything');
    }

    public function test_an_empty_answer_is_a_failure_rather_than_a_blank_shader(): void
    {
        Http::fake(['*' => Http::response(['choices' => [['message' => ['content' => '   ']]]])]);
        config([
            'services.shader.provider' => 'deepseek',
            'services.shader.base_url' => 'https://api.deepseek.com/v1',
            'services.shader.key' => 'sk-deepseek',
        ]);

        // A reasoning model that returns only its reasoning would otherwise look like success.
        $this->expectException(RuntimeException::class);
        app(ShaderGenerator::class)->generate('anything');
    }

    public function test_a_local_model_needs_no_key(): void
    {
        // Ollama on the operator's own machine: no key, no bill, no rate limit. Requiring a key
        // would make the zero-cost option unreachable.
        config(['services.shader.key' => null, 'services.shader.local' => true]);
        $this->assertTrue(app(OpenAiCompatibleDriver::class)->configured(null));

        config(['services.shader.local' => false]);
        $this->assertFalse(app(OpenAiCompatibleDriver::class)->configured(null));
        $this->assertTrue(app(OpenAiCompatibleDriver::class)->configured('sk-supplied'));
    }

    public function test_a_users_provider_choice_is_ignored_when_they_are_spending_credits(): void
    {
        Http::fake(['*' => Http::response(['choices' => [['message' => ['content' => "/*{}*/\nvoid main(){}"]]]])]);
        config([
            'services.shader.provider' => 'deepseek',
            'services.shader.base_url' => 'https://api.deepseek.com/v1',
            'services.shader.key' => 'sk-server',
        ]);
        $user = User::factory()->create(['credits' => 3]);

        // No key of their own, so the headers naming a provider must not redirect the operator's
        // spending to somewhere the operator did not choose.
        $response = $this->actingAs($user)
            ->withHeader('X-Shader-Provider', 'openai')
            ->withHeader('X-Shader-Model', 'gpt-5')
            ->postJson('/api/v1/shaders/generate', ['description' => 'aurora']);

        $response->assertOk();
        Http::assertSent(fn ($request) => str_contains($request->url(), 'api.deepseek.com'));
    }
}

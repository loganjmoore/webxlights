<?php

namespace Tests\Feature;

use Anthropic\Client;
use App\Services\Shader\AnthropicDriver;
use App\Services\Shader\OpenAiCompatibleDriver;
use App\Services\Shader\UnusableOutput;
use GuzzleHttp\Client as Guzzle;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * completeJson() on both wire formats: the request that goes out and what is made of the reply.
 * The Anthropic side runs the real SDK against a canned HTTP transport, so a renamed field in
 * the SDK shows up here rather than in production.
 */
class MagicDriversTest extends TestCase
{
    private const SCHEMA = ['type' => 'object', 'additionalProperties' => false, 'required' => ['seed'], 'properties' => ['seed' => ['type' => 'integer']]];

    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        // The driver insists on a key before it looks at the injected client.
        config(['services.shader.key' => 'sk-ant-test']);
    }

    /** A driver whose SDK client answers with the given bodies, recording what it was sent. */
    private function anthropic(array $replies): AnthropicDriver
    {
        $this->sent = [];
        $stack = HandlerStack::create(new MockHandler(array_map(fn ($r) => new Response(200, ['Content-Type' => 'application/json'], json_encode($r)), $replies)));
        $stack->push(Middleware::history($this->sent));

        return new AnthropicDriver(new Client(apiKey: 'sk-ant-test', requestOptions: ['transporter' => new Guzzle(['handler' => $stack])]));
    }

    private function message(string $text, string $stop = 'end_turn'): array
    {
        return [
            'id' => 'msg_1', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-opus-5-5',
            'content' => [
                // Adaptive thinking puts a thinking block first; the text must be found by type.
                ['type' => 'thinking', 'thinking' => 'hmm', 'signature' => 'sig'],
                ['type' => 'text', 'text' => $text],
            ],
            'stop_reason' => $stop, 'stop_sequence' => null,
            'usage' => ['input_tokens' => 11, 'output_tokens' => 22],
        ];
    }

    public function test_anthropic_asks_for_a_json_schema_not_a_forced_tool(): void
    {
        $driver = $this->anthropic([$this->message('{"seed": 7}')]);

        $result = $driver->completeJson('sys', 'user', self::SCHEMA, 'claude-opus-5-5', null);

        $this->assertSame(['seed' => 7], $result['data']);
        $this->assertSame(['input_tokens' => 11, 'output_tokens' => 22], $result['usage']);

        $body = json_decode((string) $this->sent[0]['request']->getBody(), true);
        $this->assertSame('json_schema', $body['output_config']['format']['type']);
        $this->assertSame(self::SCHEMA, $body['output_config']['format']['schema']);
        $this->assertSame('medium', $body['output_config']['effort']);
        $this->assertSame(['type' => 'adaptive'], $body['thinking']);
        $this->assertSame(16000, $body['max_tokens']);
        // Forced tool use is a 400 on Opus 5.5 and Sonnet 5.5.
        $this->assertArrayNotHasKey('tool_choice', $body);
        $this->assertArrayNotHasKey('tools', $body);
    }

    public function test_a_model_without_adaptive_thinking_gets_neither_thinking_nor_effort(): void
    {
        $driver = $this->anthropic([$this->message('{"seed": 7}')]);

        $driver->completeJson('sys', 'user', self::SCHEMA, 'claude-haiku-4-5', null);

        $body = json_decode((string) $this->sent[0]['request']->getBody(), true);
        $this->assertArrayNotHasKey('thinking', $body);
        $this->assertArrayNotHasKey('effort', $body['output_config']);
    }

    public function test_the_newest_models_are_treated_as_adaptive(): void
    {
        foreach (['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'] as $model) {
            $driver = $this->anthropic([$this->message('{"seed": 1}')]);
            $driver->completeJson('sys', 'user', self::SCHEMA, $model, null);
            $body = json_decode((string) $this->sent[0]['request']->getBody(), true);
            $this->assertSame(['type' => 'adaptive'], $body['thinking'], $model);
        }
    }

    public function test_a_refusal_a_truncated_reply_and_bad_json_all_throw(): void
    {
        foreach ([
            [$this->message('{"seed": 7}', 'refusal')],
            [$this->message('{"seed": 7', 'max_tokens')],
            [$this->message('Sure! Here is your plan.')],
            [$this->message('7')],
        ] as $reply) {
            try {
                $this->anthropic($reply)->completeJson('sys', 'user', self::SCHEMA, 'claude-opus-5-5', null);
                $this->fail('expected UnusableOutput');
            } catch (UnusableOutput) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_openai_compatible_sends_a_strict_json_schema_and_decodes_the_content(): void
    {
        Http::fake(['api.openai.com/*' => Http::response([
            'choices' => [['message' => ['content' => '{"seed": 9}']]],
            'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 6],
        ])]);

        $result = (new OpenAiCompatibleDriver)->completeJson('sys', 'user', self::SCHEMA, 'gpt-5-mini', 'sk-test', 'https://api.openai.com/v1');

        $this->assertSame(['seed' => 9], $result['data']);
        $this->assertSame(['input_tokens' => 5, 'output_tokens' => 6], $result['usage']);
        Http::assertSent(fn ($request) => $request['response_format'] === [
            'type' => 'json_schema',
            'json_schema' => ['name' => 'show_plan', 'schema' => self::SCHEMA, 'strict' => true],
        ]);
    }

    public function test_openai_compatible_throws_on_text_that_is_not_json(): void
    {
        Http::fake(['api.openai.com/*' => Http::response(['choices' => [['message' => ['content' => 'here you go']]]])]);

        $this->expectException(UnusableOutput::class);
        (new OpenAiCompatibleDriver)->completeJson('sys', 'user', self::SCHEMA, 'gpt-5-mini', 'sk-test', 'https://api.openai.com/v1');
    }
}

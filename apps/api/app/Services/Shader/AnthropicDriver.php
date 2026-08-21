<?php

namespace App\Services\Shader;

use Anthropic\Client;
use RuntimeException;

/**
 * Claude, through the official SDK.
 *
 * Kept separate from the OpenAI-compatible driver rather than folded into it, even though a
 * compatibility shim exists, because the official SDK is the supported path and the request
 * shapes genuinely differ - thinking configuration in particular has no equivalent on the other
 * side.
 */
class AnthropicDriver implements GeneratorDriver
{
    /**
     * Models configured with adaptive thinking rather than a token budget.
     *
     * The shape differs by model generation: a 4.6-or-later model rejects `budget_tokens` with a
     * 400, and Haiku 4.5 rejects `effort` the same way. Sending one shape to every model means
     * whichever half is wrong fails outright, so the capability is checked rather than assumed.
     */
    private const ADAPTIVE_THINKING = [
        'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
        'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-fable-5',
    ];

    public function __construct(private ?Client $client = null) {}

    public function configured(?string $key): bool
    {
        return (bool) ($key ?: config('services.shader.key'));
    }

    public function complete(string $system, string $user, string $model, ?string $key): array
    {
        $resolved = $key ?: config('services.shader.key');
        if (! $resolved) {
            throw new RuntimeException('No API key is configured for the shader assistant.');
        }
        // Not cached on the instance: a per-request key must not leak into the next request's
        // client, which in a long-lived worker would mean billing the wrong person.
        $client = $this->client ?? new Client(apiKey: $resolved);

        $params = [
            'model' => $model,
            'maxTokens' => 8000,
            'system' => $system,
            'messages' => [['role' => 'user', 'content' => $user]],
        ];
        if (in_array($model, self::ADAPTIVE_THINKING, true)) {
            $params['thinking'] = ['type' => 'adaptive'];
        }

        $message = $client->messages->create(...$params);

        $text = '';
        foreach ($message->content as $block) {
            // Thinking blocks come first when adaptive thinking is on, so the text is picked out
            // by type rather than by position.
            if ($block->type === 'text') {
                $text .= $block->text;
            }
        }

        return [
            'text' => $text,
            'usage' => [
                'input_tokens' => $message->usage->inputTokens ?? null,
                'output_tokens' => $message->usage->outputTokens ?? null,
            ],
        ];
    }
}

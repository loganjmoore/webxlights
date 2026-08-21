<?php

namespace App\Services\Shader;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Everything that speaks OpenAI's /chat/completions.
 *
 * That turns out to be nearly everything: OpenAI, DeepSeek, Kimi (Moonshot), xAI's Grok, Google's
 * Gemini through its compatibility endpoint, Groq, OpenRouter, and a local Ollama or LM Studio.
 * One wire format, so supporting a dozen providers is one driver and a base URL rather than a
 * dozen integrations - which matters for an open source project, where the person running it has
 * whatever account they already have rather than the one the maintainer chose.
 *
 * Raw HTTP rather than a vendor SDK on purpose. Pulling in one provider's client would make that
 * provider the privileged one and leave the rest on a shim; the request here is small enough that
 * the shared format is easier to read than any wrapper over it.
 */
class OpenAiCompatibleDriver implements GeneratorDriver
{
    public function configured(?string $key): bool
    {
        // A local runtime (Ollama, LM Studio) needs no key at all, so a configured base URL is
        // enough on its own. Requiring a key would make the zero-cost option unreachable.
        return (bool) ($key ?: config('services.shader.key') ?: config('services.shader.local'));
    }

    public function complete(string $system, string $user, string $model, ?string $key): array
    {
        $base = rtrim((string) config('services.shader.base_url'), '/');
        if ($base === '') {
            throw new RuntimeException('No API endpoint is configured for the shader assistant.');
        }
        $resolved = $key ?: config('services.shader.key');
        if (! $resolved && ! config('services.shader.local')) {
            throw new RuntimeException('No API key is configured for the shader assistant.');
        }

        $request = Http::timeout(120)->acceptJson();
        if ($resolved) {
            $request = $request->withToken($resolved);
        }

        $payload = [
            'model' => $model,
            'max_tokens' => 8000,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
        ];

        $response = $request->post("{$base}/chat/completions", $payload);

        // OpenAI's newer models (the gpt-5 family among them) reject `max_tokens` and demand
        // `max_completion_tokens`; almost every other OpenAI-compatible provider only knows
        // `max_tokens`. Sending both is also an error. So the shared name goes first, and the
        // one provider that objects tells us so and gets one retry with the name it asked for -
        // which keeps this driver working across the whole compatible fleet without a
        // per-provider capability table that would rot.
        if ($response->failed() && str_contains((string) $response->body(), 'max_completion_tokens')) {
            $payload['max_completion_tokens'] = $payload['max_tokens'];
            unset($payload['max_tokens']);
            $response = $request->post("{$base}/chat/completions", $payload);
        }

        if ($response->failed()) {
            // The provider's own message, not a generic one: "insufficient balance" and "model
            // not found" are the two most common failures and both are fixable by the person
            // reading the error, but only if they can see it.
            $detail = $response->json('error.message') ?? $response->json('message') ?? $response->body();
            throw new RuntimeException('The shader assistant was refused: '.mb_substr((string) $detail, 0, 300));
        }

        $body = $response->json();
        $text = $body['choices'][0]['message']['content'] ?? '';
        // Reasoning models on this format put their chain of thought in a sibling field and the
        // answer in `content`, so nothing extra has to be stripped - but a provider that returns
        // only reasoning and an empty answer would otherwise look like a successful blank.
        if (! is_string($text) || trim($text) === '') {
            throw new RuntimeException('The shader assistant returned an empty response.');
        }

        return [
            'text' => $text,
            'usage' => [
                'input_tokens' => $body['usage']['prompt_tokens'] ?? null,
                'output_tokens' => $body['usage']['completion_tokens'] ?? null,
            ],
        ];
    }
}

<?php

namespace App\Services\Shader;

/**
 * The providers this can be pointed at, by name.
 *
 * An operator sets SHADER_PROVIDER=deepseek and a key, rather than having to know a base URL and
 * which of two wire formats it speaks. That matters more for an open source project than it would
 * for a product: whoever runs a copy has whatever account they already have, and the difference
 * between "supported" and "not supported" should not come down to whether they can find the right
 * endpoint path.
 *
 * Default models are a starting point, not a recommendation - every one of these providers ships
 * new models faster than this list can be maintained, so SHADER_MODEL overrides it and the list
 * exists so that setting a key alone is enough to get going.
 *
 * Prices are deliberately NOT recorded here. They change constantly, a stale number in code is
 * worse than no number, and docs/SHADER-ASSISTANT-COST.md carries them with the date they were
 * checked.
 */
class Providers
{
    public const ANTHROPIC = 'anthropic';

    /**
     * @return array<string, array{driver: class-string<GeneratorDriver>, base_url: ?string, model: string, label: string}>
     */
    public static function all(): array
    {
        return [
            self::ANTHROPIC => [
                'driver' => AnthropicDriver::class,
                'base_url' => null,
                'model' => 'claude-haiku-4-5',
                'label' => 'Anthropic (Claude)',
            ],
            'openai' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://api.openai.com/v1',
                'model' => 'gpt-5-mini',
                'label' => 'OpenAI',
            ],
            'deepseek' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://api.deepseek.com/v1',
                'model' => 'deepseek-v4-flash',
                'label' => 'DeepSeek',
            ],
            'gemini' => [
                'driver' => OpenAiCompatibleDriver::class,
                // Google's OpenAI-compatibility endpoint, so it needs no driver of its own.
                'base_url' => 'https://generativelanguage.googleapis.com/v1beta/openai',
                'model' => 'gemini-2.5-flash-lite',
                'label' => 'Google Gemini',
            ],
            'xai' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://api.x.ai/v1',
                'model' => 'grok-4-3',
                'label' => 'xAI (Grok)',
            ],
            'moonshot' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://api.moonshot.ai/v1',
                'model' => 'kimi-k2.6',
                'label' => 'Moonshot (Kimi)',
            ],
            'groq' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://api.groq.com/openai/v1',
                'model' => 'llama-3.3-70b-versatile',
                'label' => 'Groq',
            ],
            'openrouter' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => 'https://openrouter.ai/api/v1',
                'model' => 'deepseek/deepseek-chat',
                'label' => 'OpenRouter',
            ],
            'ollama' => [
                'driver' => OpenAiCompatibleDriver::class,
                // A model running on the operator's own machine: no key, no bill, no rate limit.
                'base_url' => 'http://localhost:11434/v1',
                'model' => 'qwen2.5-coder:7b',
                'label' => 'Ollama (local)',
            ],
            // Anything else that speaks the same format. SHADER_BASE_URL supplies the endpoint.
            'custom' => [
                'driver' => OpenAiCompatibleDriver::class,
                'base_url' => null,
                'model' => '',
                'label' => 'Custom (OpenAI-compatible)',
            ],
        ];
    }

    public static function get(?string $name): array
    {
        $all = self::all();

        return $all[$name ?? ''] ?? $all[self::ANTHROPIC];
    }

    /** Provider names and labels, for a picker. Never includes a key or an endpoint. */
    public static function options(): array
    {
        return array_map(fn ($p, $name) => ['name' => $name, 'label' => $p['label']], self::all(), array_keys(self::all()));
    }
}

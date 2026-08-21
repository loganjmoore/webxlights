<?php

namespace App\Services;

use Anthropic\Client;
use RuntimeException;

/**
 * Turns a sentence into an ISF shader.
 *
 * The prompt is the whole product here, so it is worth saying what it is doing. Asking a model
 * for "a GLSL shader" gets desktop GLSL aimed at a 1920x1080 window. What this app needs is
 * narrower in three ways that a general answer gets wrong every time:
 *
 *   - the canvas is tiny and not square. A model is tens of pixels across, sometimes one pixel
 *     tall (a roofline). Fine detail simply is not visible, and a shader tuned for a monitor
 *     reads as noise on a prop.
 *   - it is seen from across a garden at night, as points of light. Contrast carries; subtlety
 *     does not.
 *   - it has to be ISF, because that is what the effect reads and what xLights reads.
 *
 * So the system prompt spends its length on those constraints rather than on GLSL tutoring,
 * which the model does not need.
 */
class ShaderGenerator
{
    /**
     * Models whose thinking is configured with adaptive thinking rather than a token budget.
     *
     * The request shape genuinely differs: a 4.6-or-later model rejects `budget_tokens` with a
     * 400, and Haiku 4.5 rejects `effort` the same way. Sending one request shape to every model
     * means whichever half is wrong fails outright, so the capability is checked rather than
     * assumed.
     */
    private const ADAPTIVE_THINKING = ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-fable-5'];

    private const SYSTEM = <<<'PROMPT'
    You write ISF (Interactive Shader Format) fragment shaders for webXLights, a browser
    reimplementation of xLights that drives real Christmas light displays.

    Return ONE ISF file and nothing else. No prose, no markdown fences, no explanation. The file
    is a JSON header in a block comment followed by GLSL:

    /*{
      "DESCRIPTION": "one short sentence",
      "CREDIT": "webXLights shader assistant",
      "CATEGORIES": ["Generator"],
      "INPUTS": [
        { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
      ]
    }*/
    void main() {
      vec2 uv = isf_FragNormCoord;
      gl_FragColor = vec4(uv.x, uv.y, 0.0, 1.0);
    }

    What you can rely on being declared for you (do NOT redeclare them):
      vec2  isf_FragNormCoord   the pixel, 0..1 on each axis
      vec2  RENDERSIZE          the buffer size in pixels
      float TIME                seconds since the effect started
      int   FRAMEINDEX          frames since the effect started
      vec4  PALETTE[8]          the colours the user picked for this effect
      int   PALETTE_COUNT       how many of them are set
      vec4  PALETTE_AT(int i)   palette colour i, wrapping - use this rather than indexing

    Write GLSL ES 1.00: say gl_FragColor, not a custom out variable.

    These shaders run on light displays, not monitors. That changes what works:

    - THE CANVAS IS TINY. A model is often 20-60 pixels across and can be ONE PIXEL TALL (a line
      of lights along a roof). Everything must stay legible at that size. Big shapes, broad
      bands, whole-canvas motion. No thin lines, no fine noise, no small text-like detail - at
      this resolution they alias into flicker.
    - IT IS SEEN FROM THE STREET, AT NIGHT. Use strong saturated colour and high contrast. Mid
      greys and subtle gradients disappear. Full black is genuinely off, which is useful.
    - IT LOOPS FOR MINUTES. Motion should be continuous and seamless. Nothing that builds to a
      single climax and stops, and no dependence on starting exactly at TIME 0.
    - USE THE PALETTE. Unless the user names specific colours, build the look from PALETTE_AT()
      so their chosen colours drive it. That is what makes a shader reusable across shows.

    Expose 2-5 INPUTS for the things a user would actually want to turn: speed, scale, how many
    of something, how sharp. Give every one a sensible MIN, MAX and DEFAULT. Do not expose a
    uniform you never read.

    Prefer arithmetic that is cheap and well defined: sin, cos, fract, mod, smoothstep, mix,
    length. Avoid loops with more than ~16 iterations. Never divide by something that can be
    zero. Always write a fully opaque alpha unless the user asked for transparency.
    PROMPT;

    public function __construct(private ?Client $client = null) {}

    /**
     * @param  string|null  $userKey  the caller's own API key, when they brought one
     */
    private function client(?string $userKey): Client
    {
        if ($this->client !== null) {
            return $this->client;
        }
        // The caller's key wins over the server's. A self-hosted copy has no server key at all,
        // and on the hosted site a user who brings their own is paying for their own usage - so
        // in both cases the key they supplied is the one to use.
        //
        // Deliberately not cached on the instance: a per-request key must not leak into the next
        // request's client, which in a long-lived worker would mean billing the wrong person.
        $key = $userKey ?: config('services.anthropic.key');
        if (! $key) {
            throw new RuntimeException('The shader assistant needs an Anthropic API key. Add your own in Settings, or ask the server operator to configure one.');
        }

        return new Client(apiKey: $key);
    }

    public function model(): string
    {
        return config('services.anthropic.model') ?: 'claude-haiku-4-5';
    }

    /**
     * @param  string  $description  what the user asked for
     * @param  string|null  $repairing  a compile error from a previous attempt, if this is a retry
     * @return array{source: string, usage: array}
     */
    public function generate(
        string $description,
        ?string $previousSource = null,
        ?string $repairing = null,
        ?string $userKey = null,
    ): array {
        $ask = "Write an ISF shader for a Christmas light display:\n\n{$description}";
        if ($previousSource !== null && $repairing !== null) {
            // A repair is a different job from a first draft, and saying so plainly beats
            // re-asking the original question and hoping for a different answer. The compile
            // error is the single most useful thing in the context.
            $ask = <<<TEXT
            This shader failed to compile. Fix it and return the corrected ISF file.

            The compiler said:
            {$repairing}

            The shader was:
            {$previousSource}

            It was meant to be: {$description}
            TEXT;
        }

        $model = $this->model();
        $params = [
            'model' => $model,
            'maxTokens' => 8000,
            'system' => self::SYSTEM,
            'messages' => [['role' => 'user', 'content' => $ask]],
        ];
        // Thinking is left off on the cheap models on purpose, and not only because they do not
        // take the same parameter. Thinking tokens are billed as output, at the same rate as the
        // shader itself, and they are the single largest thing on the bill - several times the
        // cost of the shader they help produce. The compile-and-repair round the client already
        // does buys back most of the accuracy for a fraction of that, because a repair is only
        // paid for when the first draft actually failed.
        if (in_array($model, self::ADAPTIVE_THINKING, true)) {
            $params['thinking'] = ['type' => 'adaptive'];
        }

        $message = $this->client($userKey)->messages->create(...$params);

        $text = '';
        foreach ($message->content as $block) {
            // Thinking blocks come first when adaptive thinking is on, so the text has to be
            // picked out by type rather than by position.
            if ($block->type === 'text') {
                $text .= $block->text;
            }
        }

        return [
            'source' => $this->unfence(trim($text)),
            'usage' => [
                'model' => $model,
                'input_tokens' => $message->usage->inputTokens ?? null,
                'output_tokens' => $message->usage->outputTokens ?? null,
            ],
        ];
    }

    /**
     * Strips a markdown fence if one came back anyway.
     *
     * The prompt asks for a bare file, and mostly gets one. Mostly is not always, and a stray
     * ```glsl line is the difference between a shader that compiles and one that does not - too
     * cheap a save to skip on the grounds that the instruction should have been enough.
     */
    private function unfence(string $text): string
    {
        if (! str_starts_with($text, '```')) {
            return $text;
        }
        $lines = preg_split('/\r?\n/', $text);
        array_shift($lines);
        while ($lines !== [] && trim(end($lines)) === '') {
            array_pop($lines);
        }
        if ($lines !== [] && str_starts_with(trim(end($lines)), '```')) {
            array_pop($lines);
        }

        return implode("\n", $lines);
    }
}

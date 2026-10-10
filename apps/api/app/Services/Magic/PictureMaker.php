<?php

namespace App\Services\Magic;

use App\Services\Shader\RequestScreen;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Draws a picture for the matrix with an image model: what a lyric names that the sprite library
 * has no drawing of ("boots on a snowy roof").
 *
 * The style is fixed and suits an LED matrix: one bold, flat cartoon subject, filling the frame,
 * on pure black, which a matrix shows as off. Every drawing is asked for as an original design,
 * and a subject that names a well-known character, brand or real person is refused before any
 * money is spent: the library draws "a reindeer", never a named one. The browser shrinks the
 * result to the matrix and keeps it in the effect; the server keeps the full drawing for the
 * next person who asks for the same thing.
 */
class PictureMaker
{
    /** In the cache key: changing the prompt draws everything again rather than mixing looks. */
    public const STYLE = 'v2';

    private const PROMPT = 'A bold, flat cartoon of %s. One simple subject, centred and filling most of the frame, '
        .'thick dark outlines, a few bright saturated colours, no shading or gradients, no text, letters or logos, '
        .'on a solid pure black background. An original design, not any existing character, brand or real person. '
        .'It will be shown on a very low resolution LED matrix, so keep it simple and instantly readable.';

    /**
     * Looks that belong to someone even unnamed, and what to draw instead. Asked for "a reindeer
     * driving a car" with only "an original design" to steer it, the model gave it a glowing red
     * nose (2026-10-09): the protected look of a famous one. Appended to the prompt whenever the
     * subject has the word.
     */
    private const DESIGN_GUARDS = [
        'reindeer' => 'The reindeer has a plain dark brown nose, not a red one.',
        'deer' => 'The deer has a plain dark brown nose, not a red one.',
        'snowman' => 'The snowman has a carrot nose and a knitted scarf, and no pipe.',
        'snowmen' => 'The snowmen have carrot noses and knitted scarves, and no pipes.',
    ];

    /**
     * Names of characters and brands people own, and real people's titles. A subject with one in
     * it is refused: drawing "Rudolph" is drawing someone's trademark. Word-bounded, lower case.
     * ponytail: a fixed list catches the obvious ones; the prompt's "original design" and the
     * image model's own policy are the layers behind it.
     */
    private const OWNED = [
        'rudolph', 'frosty', 'grinch', 'cindy lou', 'olaf', 'elsa', 'mickey', 'minnie', 'donald duck', 'goofy',
        'snoopy', 'charlie brown', 'woodstock', 'garfield', 'spongebob', 'pikachu', 'pokemon', 'mario', 'luigi',
        'sonic', 'buddy the elf', 'jack skellington', 'grogu', 'yoda', 'darth', 'hello kitty', 'peppa', 'bluey',
        'paw patrol', 'minion', 'minions', 'shrek', 'hermey', 'yukon cornelius', 'heat miser', 'snow miser',
        'polar express', 'ralphie', 'kevin mccallister', 'coca-cola', 'coca cola', 'coke', 'pepsi', 'disney',
        'pixar', 'marvel', 'batman', 'superman', 'spider-man', 'spiderman', 'barbie', 'lego',
    ];

    /**
     * A subject as it will be drawn and cached: plain words, one space, lower case, at most 80
     * characters. Null when there is nothing to draw, it names something owned, or it is
     * visibly not a description of a picture.
     */
    public static function subject(string $raw): ?string
    {
        $subject = strtolower(trim(preg_replace('/[^\p{L}\p{N}\s\'-]+/u', ' ', $raw) ?? ''));
        $subject = preg_replace('/\s+/', ' ', $subject) ?? '';
        if (mb_strlen($subject) < 2 || mb_strlen($subject) > 80) {
            return null;
        }
        foreach (self::OWNED as $name) {
            if (preg_match('/\b'.preg_quote($name, '/').'\b/u', $subject)) {
                return null;
            }
        }
        // The same screen as a show direction: "ignore your instructions", code, and the like.
        if ((new RequestScreen)->refusalForDirection($subject)) {
            return null;
        }

        return $subject;
    }

    public static function prompt(string $subject): string
    {
        $guards = array_filter(self::DESIGN_GUARDS, fn ($word) => preg_match('/\b'.$word.'\b/u', $subject), ARRAY_FILTER_USE_KEY);

        return trim(sprintf(self::PROMPT, $subject).' '.implode(' ', $guards));
    }

    public static function key(string $subject): string
    {
        return sha1(self::STYLE.'|'.$subject);
    }

    public function configured(): bool
    {
        return (bool) config('services.pictures.key');
    }

    /**
     * Draws each subject at once (the calls run side by side) and returns, per subject, the PNG
     * bytes or the reason it failed.
     *
     * @param  array<int|string, string>  $subjects  keyed however the caller likes
     * @return array<int|string, array{png: ?string, error: ?string}>
     */
    public function drawAll(array $subjects): array
    {
        $key = config('services.pictures.key');
        if (! $key) {
            throw new RuntimeException('Picture drawing is not configured on this server (OPENAI_API_KEY).');
        }
        $url = rtrim((string) config('services.pictures.base_url'), '/').'/images/generations';
        $body = fn (string $subject) => [
            'model' => config('services.pictures.model'),
            'prompt' => self::prompt($subject),
            'size' => '1024x1024',
            'quality' => config('services.pictures.quality'),
            'n' => 1,
            'output_format' => 'png',
        ];
        // An image takes the model a while; all of them at once rather than one after another.
        $responses = Http::pool(fn (Pool $pool) => array_map(
            fn ($id) => $pool->as((string) $id)->timeout(180)->withToken($key)->acceptJson()->post($url, $body($subjects[$id])),
            array_keys($subjects),
        ));

        $out = [];
        foreach (array_keys($subjects) as $id) {
            $response = $responses[(string) $id] ?? null;
            if (! $response instanceof Response) {
                $out[$id] = ['png' => null, 'error' => 'The image service could not be reached.'];

                continue;
            }
            $png = $response->successful() ? base64_decode((string) $response->json('data.0.b64_json'), true) : false;
            $out[$id] = $png
                ? ['png' => $png, 'error' => null]
                : ['png' => null, 'error' => 'The image service refused: '.($response->json('error.message') ?: "HTTP {$response->status()}")];
        }

        return $out;
    }
}

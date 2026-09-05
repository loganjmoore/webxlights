<?php

namespace App\Http\Controllers;

use App\Models\Shader;
use Illuminate\Http\Request;

// The shader library: the gallery everyone reads and the shaders one person owns.
//
// Deliberately not scoped to a layout or a project, unlike everything else in this API. A shader
// is content rather than configuration - the point of making one is that other people can use
// it - so it belongs to its author and is visible to everybody.
class ShaderController extends Controller
{
    private const PER_PAGE = 24;

    // The parsed ISF header the client sends alongside the source. Bounded, because both columns
    // are JSON that every gallery card renders: an unbounded array is a way to make a page of 24
    // cards weigh megabytes, and a category is a short word from a fixed vocabulary.
    private const SHAPE_RULES = [
        'inputs' => ['sometimes', 'array', 'max:32'],
        'inputs.*' => ['array'],
        'inputs.*.name' => ['required', 'string', 'max:64'],
        'inputs.*.type' => ['required', 'string', 'max:16'],
        'inputs.*.label' => ['nullable', 'string', 'max:64'],
        'categories' => ['sometimes', 'array', 'max:12'],
        'categories.*' => ['string', 'max:60'],
    ];

    public function index(Request $request)
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'mine' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:recent,popular'],
            // The library ships with 50 shaders, so browsing needs more than one long list:
            // which kind of shader, and which category within it.
            'kind' => ['nullable', 'in:all,builtin,community'],
            'category' => ['nullable', 'string', 'max:60'],
            // The caller's own collection: what they starred, whoever made it.
            'favourites' => ['nullable', 'boolean'],
        ]);

        $userId = $request->user()?->id;
        $query = Shader::query()->with('author:id,name')->withFavouritedBy($userId);

        if ($data['favourites'] ?? false) {
            $query->whereHas('favouritedBy', fn ($q) => $q->where('users.id', $userId ?? 0));
        }

        if ($data['mine'] ?? false) {
            $query->where('user_id', $userId);
        } else {
            $query->visibleTo($userId);
        }

        // Built-ins are the shaders that ship with the app; community ones are what people made.
        // Worth separating because they answer different questions - "what can this do?" versus
        // "what has anyone made?" - and because 50 built-ins would otherwise bury every new
        // user creation under the recency sort.
        if (($data['kind'] ?? 'all') === 'builtin') {
            $query->whereNotNull('builtin_key');
        } elseif (($data['kind'] ?? 'all') === 'community') {
            $query->whereNull('builtin_key');
        }

        if ($category = $data['category'] ?? null) {
            // categories is a JSON array on both Postgres and SQLite. A LIKE over the encoded
            // text is exact enough for a short, controlled vocabulary and works identically on
            // both, which whereJsonContains does not.
            $query->whereRaw('LOWER(categories) LIKE ?', ['%"'.strtolower(str_replace(['%', '_'], ['\%', '\_'], $category)).'"%']);
        }

        if ($term = $data['q'] ?? null) {
            // Name, description and the prompt it was generated from. The prompt is included
            // because it is the most natural thing to search a generated shader by - people
            // look for "swirling fire", which is what the author typed, not for the GLSL.
            // LOWER(...) LIKE rather than Postgres' ilike: production is Postgres but the test
            // suite runs on SQLite, and an operator only one of them has is a search that is
            // never exercised before it ships.
            $like = '%'.strtolower(str_replace(['%', '_'], ['\%', '\_'], $term)).'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(description) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(prompt) LIKE ?', [$like]);
            });
        }

        $query->orderByDesc(($data['sort'] ?? 'recent') === 'popular' ? 'use_count' : 'created_at');


        return response()->json($query->paginate(self::PER_PAGE));
    }

    public function show(Request $request, Shader $shader)
    {
        abort_unless($shader->is_public || $shader->user_id === $request->user()?->id, 404);

        return response()->json(Shader::withFavouritedBy($request->user()?->id)->with('author:id,name')->findOrFail($shader->id));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'source' => ['required', 'string', 'max:100000'],
            ...self::SHAPE_RULES,
            'is_public' => ['boolean'],
            'prompt' => ['nullable', 'string', 'max:4000'],
            'ai_generated' => ['boolean'],
        ]);

        $shader = $request->user()->shaders()->create([
            ...$data,
            // Public unless the author says otherwise: a gallery nobody publishes to is empty.
            'is_public' => $data['is_public'] ?? true,
        ]);

        return response()->json($shader->load('author:id,name'), 201);
    }

    public function update(Request $request, Shader $shader)
    {
        abort_unless($shader->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'source' => ['sometimes', 'string', 'max:100000'],
            ...self::SHAPE_RULES,
            'is_public' => ['sometimes', 'boolean'],
        ]);
        $shader->update($data);

        return response()->json($shader->fresh()->load('author:id,name'));
    }

    public function destroy(Request $request, Shader $shader)
    {
        abort_unless($shader->user_id === $request->user()->id, 403);
        $shader->delete();

        return response()->noContent();
    }

    /** Puts a shader in the caller's collection. Idempotent: starring twice is one star. */
    public function favourite(Request $request, Shader $shader)
    {
        abort_unless($shader->is_public || $shader->user_id === $request->user()->id, 404);
        $shader->favouritedBy()->syncWithoutDetaching([$request->user()->id]);

        return response()->json(['favourited' => true]);
    }

    public function unfavourite(Request $request, Shader $shader)
    {
        $shader->favouritedBy()->detach($request->user()->id);

        return response()->json(['favourited' => false]);
    }

    /**
     * Records that someone put this shader in a sequence.
     *
     * Separate from `show` because opening a gallery card to look at it is not the same as using
     * it, and "popular" should rank what people actually put in their shows.
     */
    public function used(Request $request, Shader $shader)
    {
        abort_unless($shader->is_public || $shader->user_id === $request->user()?->id, 404);
        $shader->increment('use_count');

        return response()->json(['use_count' => $shader->fresh()->use_count]);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Shader;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShaderLibraryTest extends TestCase
{
    use RefreshDatabase;

    private function shader(User $user, array $attrs = []): Shader
    {
        return $user->shaders()->create([
            'name' => 'Plasma',
            'source' => 'void main(){}',
            'inputs' => [],
            'categories' => [],
            'is_public' => true,
            ...$attrs,
        ]);
    }

    public function test_the_gallery_shows_everyones_public_shaders(): void
    {
        $me = User::factory()->create();
        $someone = User::factory()->create();
        $this->shader($someone, ['name' => 'Theirs']);
        $this->shader($me, ['name' => 'Mine']);

        $names = collect($this->actingAs($me)->getJson('/api/v1/shaders')->json('data'))->pluck('name');

        // The whole point of the library: a shader someone else made is usable by me.
        $this->assertEqualsCanonicalizing(['Theirs', 'Mine'], $names->all());
    }

    public function test_a_private_shader_is_hidden_from_everyone_else(): void
    {
        $author = User::factory()->create();
        $other = User::factory()->create();
        $private = $this->shader($author, ['name' => 'Secret', 'is_public' => false]);

        $names = collect($this->actingAs($other)->getJson('/api/v1/shaders')->json('data'))->pluck('name');
        $this->assertNotContains('Secret', $names->all());
        $this->actingAs($other)->getJson("/api/v1/shaders/{$private->id}")->assertNotFound();

        // ...but its author still sees it, or "private" would mean "deleted".
        $mine = $this->actingAs($author)->getJson('/api/v1/shaders?mine=1')->json('data');
        $this->assertSame(['Secret'], collect($mine)->pluck('name')->all());
    }

    public function test_a_shader_is_public_by_default(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->postJson('/api/v1/shaders', [
            'name' => 'Aurora',
            'source' => 'void main(){}',
        ]);
        // A gallery nobody publishes to is empty, so publishing is what happens by default.
        $response->assertCreated()->assertJsonPath('is_public', true);
    }

    public function test_search_matches_the_prompt_it_was_generated_from(): void
    {
        $user = User::factory()->create();
        $this->shader($user, ['name' => 'Untitled 4', 'prompt' => 'swirling fire over the roof']);
        $this->shader($user, ['name' => 'Untitled 5', 'prompt' => 'gentle blue snowfall']);

        // People look for what they asked for, not for the GLSL.
        $hits = $this->actingAs($user)->getJson('/api/v1/shaders?q=fire')->json('data');
        $this->assertCount(1, $hits);
        $this->assertSame('Untitled 4', $hits[0]['name']);
    }

    public function test_only_the_author_can_change_or_delete_a_shader(): void
    {
        $author = User::factory()->create();
        $intruder = User::factory()->create();
        $shader = $this->shader($author);

        $this->actingAs($intruder)->patchJson("/api/v1/shaders/{$shader->id}", ['name' => 'Mine now'])->assertForbidden();
        $this->actingAs($intruder)->deleteJson("/api/v1/shaders/{$shader->id}")->assertForbidden();
        $this->actingAs($author)->patchJson("/api/v1/shaders/{$shader->id}", ['name' => 'Renamed'])->assertOk();
    }

    public function test_a_published_shader_survives_its_author(): void
    {
        $author = User::factory()->create();
        $shader = $this->shader($author);
        $author->delete();

        // Other people's sequences already reference it; it must not vanish out from under them.
        $this->assertDatabaseHas('shaders', ['id' => $shader->id, 'user_id' => null]);
    }

    public function test_use_count_ranks_the_popular_list(): void
    {
        $user = User::factory()->create();
        $quiet = $this->shader($user, ['name' => 'Quiet']);
        $loved = $this->shader($user, ['name' => 'Loved']);

        $this->actingAs($user)->postJson("/api/v1/shaders/{$loved->id}/used")->assertOk();
        $this->actingAs($user)->postJson("/api/v1/shaders/{$loved->id}/used")->assertOk();

        $names = collect($this->actingAs($user)->getJson('/api/v1/shaders?sort=popular')->json('data'))->pluck('name');
        $this->assertSame('Loved', $names->first());
        $this->assertContains('Quiet', $names->all());
    }
}

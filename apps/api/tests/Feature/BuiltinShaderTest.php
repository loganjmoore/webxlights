<?php

namespace Tests\Feature;

use App\Models\Shader;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The shaders that ship with the app have to reach the gallery on a fresh install, and keep
 * their identity across every re-deploy after that.
 *
 * This is the part of the library that is easiest to get quietly wrong: a seeder passes locally
 * and never runs in production, and a publish keyed on anything but a stable id either duplicates
 * the library on every deploy or silently stops updating it. Each of those failures is invisible
 * until someone looks at a production gallery, so they are pinned here instead.
 */
class BuiltinShaderTest extends TestCase
{
    use RefreshDatabase;

    /** Writes a builtin-shaders.json for the command to read, and cleans up after itself. */
    private function library(array $entries): void
    {
        $dir = database_path('data');
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        $path = $dir.'/builtin-shaders.json';
        if (! isset($this->originalLibrary)) {
            $this->originalLibrary = is_file($path) ? file_get_contents($path) : null;
        }
        file_put_contents($path, json_encode($entries));
    }

    private ?string $originalLibrary = null;

    protected function tearDown(): void
    {
        $path = database_path('data/builtin-shaders.json');
        if ($this->originalLibrary !== null) {
            file_put_contents($path, $this->originalLibrary);
        }
        parent::tearDown();
    }

    private function entry(string $key, array $attrs = []): array
    {
        return [
            'builtin_key' => $key,
            'name' => ucfirst($key),
            'description' => 'a built-in',
            'source' => "/*{\"DESCRIPTION\":\"x\",\"INPUTS\":[]}*/\nvoid main(){ gl_FragColor = vec4(1.0); }",
            'inputs' => [],
            'categories' => ['Generator'],
            'prompt' => 'something a user would type',
            ...$attrs,
        ];
    }

    public function test_publishing_puts_the_library_in_the_gallery_with_no_author(): void
    {
        $this->library([$this->entry('candy-cane'), $this->entry('plasma-storm')]);

        $this->artisan('shaders:publish-builtins')->assertSuccessful();

        $this->assertSame(2, Shader::whereNotNull('builtin_key')->count());
        $shader = Shader::where('builtin_key', 'candy-cane')->firstOrFail();
        // Authorless on purpose: shaders.user_id is nullable so a shader can outlive its author,
        // and a built-in never had one. A fake user would show up as a person in the gallery.
        $this->assertNull($shader->user_id);
        $this->assertTrue($shader->is_public);
        $this->assertSame('Candy-cane', $shader->name);
    }

    public function test_publishing_twice_updates_rather_than_duplicates(): void
    {
        $this->library([$this->entry('candy-cane')]);
        $this->artisan('shaders:publish-builtins')->assertSuccessful();

        // The library changes and the app is re-deployed - which runs the command again.
        $this->library([$this->entry('candy-cane', ['name' => 'Candy Cane Mk2', 'description' => 'brighter'])]);
        $this->artisan('shaders:publish-builtins')->assertSuccessful();

        $this->assertSame(1, Shader::whereNotNull('builtin_key')->count(), 'a re-deploy must not duplicate the library');
        $shader = Shader::where('builtin_key', 'candy-cane')->firstOrFail();
        $this->assertSame('Candy Cane Mk2', $shader->name);
        $this->assertSame('brighter', $shader->description);
    }

    public function test_a_republish_keeps_how_often_people_used_it(): void
    {
        $this->library([$this->entry('candy-cane')]);
        $this->artisan('shaders:publish-builtins');
        $shader = Shader::where('builtin_key', 'candy-cane')->firstOrFail();
        $shader->use_count = 17;
        $shader->save();

        $this->artisan('shaders:publish-builtins');

        // use_count is a fact about this install, not about the library, so shipping a new
        // version of a shader must not reset how popular it is here.
        $this->assertSame(17, Shader::where('builtin_key', 'candy-cane')->firstOrFail()->use_count);
    }

    public function test_a_missing_library_file_is_not_a_failure(): void
    {
        $path = database_path('data/builtin-shaders.json');
        $this->originalLibrary = is_file($path) ? file_get_contents($path) : null;
        @unlink($path);

        // A boot must not fail because sample content is absent.
        $this->artisan('shaders:publish-builtins')->assertSuccessful();
        $this->assertSame(0, Shader::whereNotNull('builtin_key')->count());
    }

    public function test_built_ins_are_visible_and_filterable_alongside_community_shaders(): void
    {
        $this->library([$this->entry('candy-cane')]);
        $this->artisan('shaders:publish-builtins');
        $user = User::factory()->create();
        $user->shaders()->create([
            'name' => 'Mine', 'source' => 'void main(){}', 'inputs' => [], 'categories' => [], 'is_public' => true,
        ]);

        $all = collect($this->actingAs($user)->getJson('/api/v1/shaders')->json('data'))->pluck('name');
        $this->assertContains('Candy-cane', $all);
        $this->assertContains('Mine', $all);

        $builtin = collect($this->actingAs($user)->getJson('/api/v1/shaders?kind=builtin')->json('data'))->pluck('name');
        $this->assertSame(['Candy-cane'], $builtin->all());

        $community = collect($this->actingAs($user)->getJson('/api/v1/shaders?kind=community')->json('data'))->pluck('name');
        $this->assertSame(['Mine'], $community->all());
    }

    public function test_the_gallery_can_be_browsed_by_category(): void
    {
        $this->library([
            $this->entry('candy-cane', ['categories' => ['Generator', 'Seasonal']]),
            $this->entry('plasma-storm', ['categories' => ['Generator']]),
        ]);
        $this->artisan('shaders:publish-builtins');
        $user = User::factory()->create();

        $seasonal = collect($this->actingAs($user)->getJson('/api/v1/shaders?category=Seasonal')->json('data'))->pluck('name');
        $this->assertSame(['Candy-cane'], $seasonal->all());

        $generator = collect($this->actingAs($user)->getJson('/api/v1/shaders?category=Generator')->json('data'))->pluck('name');
        $this->assertCount(2, $generator);
    }

    public function test_a_built_in_is_searchable_by_the_prompt_a_user_would_type(): void
    {
        $this->library([$this->entry('candy-cane', ['prompt' => 'red and white stripes spiralling slowly'])]);
        $this->artisan('shaders:publish-builtins');
        $user = User::factory()->create();

        $found = collect($this->actingAs($user)->getJson('/api/v1/shaders?q=spiralling')->json('data'))->pluck('name');
        $this->assertSame(['Candy-cane'], $found->all());
    }

    public function test_nobody_can_edit_or_delete_a_built_in(): void
    {
        $this->library([$this->entry('candy-cane')]);
        $this->artisan('shaders:publish-builtins');
        $shader = Shader::where('builtin_key', 'candy-cane')->firstOrFail();
        $user = User::factory()->create();

        // A built-in has no author, so the ownership check that guards every other write fails
        // for everyone - which is the behaviour we want, and worth pinning so a later change to
        // that check does not quietly hand the shipped library to whoever asks first.
        $this->actingAs($user)->patchJson("/api/v1/shaders/{$shader->id}", ['name' => 'Hijacked'])->assertForbidden();
        $this->actingAs($user)->deleteJson("/api/v1/shaders/{$shader->id}")->assertForbidden();
        $this->assertSame('Candy-cane', $shader->fresh()->name);
    }

    public function test_prune_removes_a_built_in_that_left_the_library(): void
    {
        $this->library([$this->entry('candy-cane'), $this->entry('retired')]);
        $this->artisan('shaders:publish-builtins');
        $this->assertSame(2, Shader::whereNotNull('builtin_key')->count());

        $this->library([$this->entry('candy-cane')]);
        $this->artisan('shaders:publish-builtins --prune')->assertSuccessful();

        $this->assertSame(1, Shader::whereNotNull('builtin_key')->count());
        $this->assertNull(Shader::where('builtin_key', 'retired')->first());
    }
}

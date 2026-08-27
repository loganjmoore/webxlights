<?php

namespace App\Console\Commands;

use App\Models\Shader;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Puts the shipped shader library into the gallery, on every install, without anyone clicking
 * generate.
 *
 * Why a console command rather than the two obvious alternatives:
 *
 *   - NOT a seeder. The container runs `php artisan migrate --force` on every boot and never
 *     runs a seeder (docker/entrypoint.sh). A DatabaseSeeder entry works perfectly on a laptop
 *     and silently does nothing in production, which is the worst kind of wrong: it looks
 *     correct everywhere you would think to check.
 *   - NOT a one-shot data migration. A migration runs once, ever. Updating the library later
 *     would mean authoring a new migration for every change, and the fiftieth one would be
 *     indistinguishable from the first. This command is idempotent and runs on every boot, so a
 *     re-deploy updates the library instead of duplicating it or ignoring it.
 *
 * The content comes from database/data/builtin-shaders.json, which is baked from
 * packages/shaders/library by tools/shader-check/bake-builtins.mjs. `packages/` is not in the
 * runtime image, so reading the .fs files directly here would work in development and fail in
 * production - the exact trap the bake step exists to avoid.
 */
class PublishBuiltinShaders extends Command
{
    protected $signature = 'shaders:publish-builtins {--prune : delete built-ins that are no longer in the library}';

    protected $description = 'Publish the shaders that ship with the app into the gallery (idempotent)';

    public function handle(): int
    {
        $path = database_path('data/builtin-shaders.json');
        if (! is_file($path)) {
            // Not an error. A checkout that has never run the bake step has no file, and a boot
            // must not fail over missing sample content.
            $this->info('no builtin-shaders.json - nothing to publish');

            return self::SUCCESS;
        }

        $entries = json_decode((string) file_get_contents($path), true);
        if (! is_array($entries)) {
            $this->error('builtin-shaders.json is not valid JSON');

            return self::FAILURE;
        }

        $created = 0;
        $updated = 0;

        DB::transaction(function () use ($entries, &$created, &$updated) {
            foreach ($entries as $entry) {
                $key = $entry['builtin_key'] ?? null;
                if (! is_string($key) || $key === '') {
                    continue;
                }

                $existing = Shader::query()->where('builtin_key', $key)->first();
                $attributes = [
                    'name' => $entry['name'] ?? $key,
                    'description' => $entry['description'] ?? null,
                    'source' => $entry['source'] ?? '',
                    'inputs' => $entry['inputs'] ?? [],
                    'categories' => $entry['categories'] ?? [],
                    'prompt' => $entry['prompt'] ?? null,
                    'is_public' => true,
                    // Built-ins were written through the generator, and saying so is honest.
                    'ai_generated' => true,
                ];

                if ($existing) {
                    // use_count belongs to the install, not to the library, so it is never
                    // overwritten by a re-publish.
                    // No fake author. shaders.user_id is nullable precisely so a shader can
                    // outlive its author, and a built-in never had one.
                    $existing->fill($attributes);
                    $existing->user_id = null;
                    $existing->save();
                    $updated++;
                } else {
                    $shader = new Shader($attributes);
                    $shader->builtin_key = $key;
                    $shader->user_id = null;
                    $shader->save();
                    $created++;
                }
            }
        });

        if ($this->option('prune')) {
            $keys = array_values(array_filter(array_column($entries, 'builtin_key')));
            $removed = Shader::query()->whereNotNull('builtin_key')->whereNotIn('builtin_key', $keys)->delete();
            if ($removed) {
                $this->info("pruned {$removed} built-in(s) no longer in the library");
            }
        }

        $this->info("built-in shaders: {$created} created, {$updated} updated");

        return self::SUCCESS;
    }
}

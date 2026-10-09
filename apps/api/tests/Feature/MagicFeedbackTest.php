<?php

namespace Tests\Feature;

use App\Models\MagicFeedback;
use App\Models\Project;
use App\Models\Sequence;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /v1/sequences/{sequence}/magic-feedback and magic:export-feedback: what somebody changed in
 * a Magic Sequence, shared on purpose, kept as counts and summaries only.
 */
class MagicFeedbackTest extends TestCase
{
    use RefreshDatabase;

    private function sequenceFor(User $owner): Sequence
    {
        $project = Project::factory()->for($owner, 'owner')->create();

        return $project->sequences()->create(['name' => 'Carol', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []]]);
    }

    private function payload(array $over = []): array
    {
        return [
            'v' => 1, 'style' => 'show', 'feel' => 'auto', 'bpm' => 120,
            'sections' => [['label' => 'verse', 'energy' => 0.5, 'bars' => 16], ['label' => 'chorus', 'energy' => 0.9, 'bars' => 16]],
            'rows' => [
                ['role' => 'arch', 'tier' => 'feature', 'placed' => ['SingleStrand' => 12, 'Strobe' => 4], 'now' => ['SingleStrand' => 12, 'Twinkle' => 3]],
                ['role' => 'mega_tree', 'tier' => 'hero', 'placed' => ['Spirals' => 8], 'now' => []],
            ],
            ...$over,
        ];
    }

    private function share(User $user, Sequence $sequence, ?array $payload = null)
    {
        return $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/magic-feedback", $payload ?? $this->payload());
    }

    public function test_only_an_editor_of_the_sequence_can_share(): void
    {
        $owner = User::factory()->create();
        $sequence = $this->sequenceFor($owner);
        $viewer = User::factory()->create();
        $sequence->project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);

        $this->postJson("/api/v1/sequences/{$sequence->id}/magic-feedback", $this->payload())->assertUnauthorized();
        $this->share(User::factory()->create(), $sequence)->assertForbidden();
        $this->share($viewer, $sequence)->assertForbidden();
        $this->assertDatabaseCount('magic_feedback', 0);
    }

    public function test_a_share_is_stored_once_per_person_and_sequence(): void
    {
        $owner = User::factory()->create();
        $sequence = $this->sequenceFor($owner);

        $this->share($owner, $sequence)->assertCreated()->assertJson(['shared' => true]);
        $this->share($owner, $sequence, $this->payload(['style' => 'classic']))->assertOk();

        $this->assertDatabaseCount('magic_feedback', 1);
        $stored = MagicFeedback::first()->payload;
        $this->assertSame('classic', $stored['style']);
        $this->assertSame(['SingleStrand' => 12, 'Twinkle' => 3], $stored['rows'][0]['now']);
    }

    public static function badPayloads(): array
    {
        return [
            'unknown version' => [fn (array $p) => data_set($p, 'v', 2), 'v'],
            'unknown role' => [fn (array $p) => data_set($p, 'rows.0.role', 'unicorn'), 'rows.0.role'],
            'negative count' => [fn (array $p) => data_set($p, 'rows.0.now.Twinkle', -1), 'rows.0.now.Twinkle'],
            'free text smuggled as an effect name' => [fn (array $p) => data_set($p, 'rows.0.now', ['my address is 12 Elm St, Springfield' => 1]), 'rows.0'],
            'no rows' => [fn (array $p) => data_set($p, 'rows', []), 'rows'],
            'unknown label' => [fn (array $p) => data_set($p, 'sections.0.label', 'refrain'), 'sections.0.label'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('badPayloads')]
    public function test_anything_but_counts_and_summaries_is_422(callable $edit, string $field): void
    {
        $owner = User::factory()->create();

        $this->share($owner, $this->sequenceFor($owner), $edit($this->payload()))->assertStatus(422)->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('magic_feedback', 0);
    }

    public function test_the_export_is_the_payloads_without_who_shared_them(): void
    {
        $owner = User::factory()->create(['email' => 'sharer@example.test']);
        $this->share($owner, $this->sequenceFor($owner))->assertCreated();
        $this->share($owner, $this->sequenceFor($owner), $this->payload(['bpm' => 90]))->assertCreated();
        $path = tempnam(sys_get_temp_dir(), 'magic');

        $this->artisan('magic:export-feedback', ['path' => $path])->assertSuccessful();

        $lines = array_values(array_filter(explode("\n", file_get_contents($path))));
        unlink($path);
        $this->assertCount(2, $lines);
        $this->assertSame(90, json_decode($lines[1], true)['bpm']);
        foreach ($lines as $line) {
            $this->assertStringNotContainsString('sharer', $line);
            $this->assertArrayNotHasKey('user_id', json_decode($line, true));
        }
    }
}

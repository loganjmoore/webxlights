<?php

namespace Tests\Feature;

use App\Models\Layout;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LayoutVersionsTest extends TestCase
{
    use RefreshDatabase;

    private function layoutWithModels(User $user): Layout
    {
        $project = Project::factory()->create(['owner_id' => $user->id]);
        $layout = $project->layouts()->create(['name' => 'Layout', 'settings' => ['views' => [['name' => 'Front', 'rowKeys' => []]]]]);
        $layout->models()->create([
            'name' => 'Mega Tree',
            'type' => 'Tree',
            'supported' => true,
            'sub_models' => [['name' => 'Star', 'type' => 'ranges', 'rows' => ['1-10']]],
            'states' => [['name' => 'State1', 'entries' => [['name' => 'wink', 'nodes' => '1-5']]]],
        ]);
        $layout->models()->create(['name' => 'Arch', 'type' => 'Arches', 'supported' => true]);

        return $layout;
    }

    public function test_a_snapshot_captures_everything_that_makes_a_layout(): void
    {
        // The point of the feature: the layout had no history at all, so a mis-drag or a bad
        // import was unrecoverable.
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions")->assertCreated();

        $snapshot = $layout->versions()->first()->snapshot;
        $this->assertCount(2, $snapshot['models']);
        // The things that live *inside* a model have to come along, as they do in a package.
        $tree = collect($snapshot['models'])->firstWhere('name', 'Mega Tree');
        $this->assertSame('Star', $tree['sub_models'][0]['name']);
        $this->assertSame('wink', $tree['states'][0]['entries'][0]['name']);
        $this->assertSame('Front', $snapshot['settings']['views'][0]['name']);
    }

    public function test_restoring_brings_back_a_deleted_model(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions")->assertCreated();
        $version = $layout->versions()->first();

        $layout->models()->where('name', 'Arch')->delete();
        $this->assertCount(1, $layout->fresh()->models);

        $this->actingAs($user)
            ->postJson("/api/v1/layouts/{$layout->id}/versions/{$version->id}/restore")
            ->assertOk();

        $this->assertCount(2, $layout->fresh()->models);
    }

    public function test_restoring_keeps_the_ids_that_sequences_point_at(): void
    {
        // A model's id is what every sequence body addresses. Recreating models wholesale would
        // leave every sequence in the project pointing at rows that no longer exist - which is
        // why the restore matches by name.
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);
        $treeId = $layout->models()->where('name', 'Mega Tree')->value('id');
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions")->assertCreated();
        $version = $layout->versions()->first();

        $layout->models()->where('name', 'Mega Tree')->update(['type' => 'Matrix']);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions/{$version->id}/restore")->assertOk();

        $restored = $layout->fresh()->models()->where('name', 'Mega Tree')->first();
        $this->assertSame($treeId, $restored->id);
        $this->assertSame('Tree', $restored->type);
    }

    public function test_restoring_removes_a_model_added_after_the_snapshot(): void
    {
        // A restore that left it would be a merge, which is a different thing and one nobody
        // asked for.
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions")->assertCreated();
        $version = $layout->versions()->first();

        $layout->models()->create(['name' => 'Added Later', 'type' => 'Arches', 'supported' => true]);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions/{$version->id}/restore")->assertOk();

        $this->assertNull($layout->fresh()->models()->where('name', 'Added Later')->first());
    }

    public function test_automatic_snapshots_are_pruned_but_manual_ones_are_kept(): void
    {
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);

        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions", ['reason' => 'manual']);
        for ($i = 0; $i < 25; $i++) {
            $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions", ['reason' => 'auto']);
        }

        $this->assertSame(1, $layout->versions()->where('reason', 'manual')->count());
        $this->assertSame(20, $layout->versions()->where('reason', 'auto')->count());
    }

    public function test_the_list_does_not_carry_the_snapshots(): void
    {
        // Twenty layouts' worth of JSON would be megabytes, and the list is only ever used to
        // choose one.
        $user = User::factory()->create();
        $layout = $this->layoutWithModels($user);
        $this->actingAs($user)->postJson("/api/v1/layouts/{$layout->id}/versions");

        $response = $this->actingAs($user)->getJson("/api/v1/layouts/{$layout->id}/versions")->assertOk();
        $this->assertArrayNotHasKey('snapshot', $response->json()[0]);
    }

    public function test_another_users_layout_is_out_of_reach(): void
    {
        $owner = User::factory()->create();
        $layout = $this->layoutWithModels($owner);
        $stranger = User::factory()->create();

        $this->actingAs($stranger)->postJson("/api/v1/layouts/{$layout->id}/versions")->assertForbidden();
        $this->actingAs($stranger)->getJson("/api/v1/layouts/{$layout->id}/versions")->assertForbidden();
    }

    // pruneAuto has always capped the *automatic* snapshots by count. The manual ones - taken
    // deliberately before a big change - grew without limit, and the retention preference applied
    // to sequence history and not to layout history. A setting that silently governs one of two
    // things reads as though it worked.
    public function test_purging_removes_old_layout_snapshots_but_never_the_newest(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $layout = $project->layouts()->create(['name' => 'Yard']);

        foreach ([1, 2, 3] as $n) {
            $version = $layout->versions()->create([
                'number' => $n,
                'snapshot' => ['models' => []],
                'reason' => 'manual',
                'created_by' => $user->id,
            ]);
            // created_at isn't fillable, so it has to be aged after the fact or every snapshot
            // looks new and the purge finds nothing.
            $version->forceFill(['created_at' => now()->subDays(120)])->saveQuietly();
        }

        $this->actingAs($user)
            ->postJson("/api/v1/layouts/{$layout->id}/versions/purge", ['older_than_days' => 90])
            ->assertOk()
            ->assertJsonPath('deleted', 2);

        $this->assertSame(1, $layout->versions()->count());
        $this->assertSame(3, $layout->versions()->first()->number);
    }

    public function test_a_viewer_cannot_purge_layout_snapshots(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();
        $this->actingAs($owner)->postJson("/api/v1/projects/{$project->id}/members", [
            'email' => $viewer->email, 'role' => 'viewer',
        ])->assertCreated();
        $layout = $project->layouts()->create(['name' => 'Yard']);

        $this->actingAs($viewer)
            ->postJson("/api/v1/layouts/{$layout->id}/versions/purge", ['older_than_days' => 7])
            ->assertForbidden();
    }
}

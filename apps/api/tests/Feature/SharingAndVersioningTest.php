<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SharingAndVersioningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    public function test_owner_can_share_a_project_and_the_member_gains_access_by_role(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $editor = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();

        $this->actingAs($owner)->postJson("/api/v1/projects/{$project->id}/members", [
            'email' => $viewer->email, 'role' => 'viewer',
        ])->assertCreated();
        $this->actingAs($owner)->postJson("/api/v1/projects/{$project->id}/members", [
            'email' => $editor->email, 'role' => 'editor',
        ])->assertCreated();

        $this->actingAs($viewer)->getJson("/api/v1/projects/{$project->id}")->assertOk();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);
        $this->actingAs($viewer)->putJson("/api/v1/sequences/{$seq->id}/body", ['body' => []])->assertForbidden();

        $this->actingAs($editor)->putJson("/api/v1/sequences/{$seq->id}/body", ['body' => ['rows' => []]])->assertOk();

        $this->actingAs($viewer)->getJson('/api/v1/projects')->assertOk()->assertJsonCount(1);
    }

    public function test_only_the_owner_can_manage_members(): void
    {
        $owner = User::factory()->create();
        $editor = User::factory()->create();
        $stranger = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();
        $project->members()->create(['user_id' => $editor->id, 'role' => 'editor']);

        $this->actingAs($editor)->postJson("/api/v1/projects/{$project->id}/members", [
            'email' => $stranger->email, 'role' => 'viewer',
        ])->assertForbidden();
    }

    public function test_snapshot_and_restore_a_sequence_version(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000, 'body' => ['rows' => ['v1']]]);

        $v1 = $this->actingAs($user)->postJson("/api/v1/sequences/{$seq->id}/versions")->assertCreated();
        $v1->assertJsonPath('number', 1)->assertJsonPath('body.rows.0', 'v1');

        $this->actingAs($user)->putJson("/api/v1/sequences/{$seq->id}/body", ['body' => ['rows' => ['v2']]])->assertOk();
        $this->actingAs($user)->postJson("/api/v1/sequences/{$seq->id}/versions")->assertCreated()->assertJsonPath('number', 2);

        $versions = $this->actingAs($user)->getJson("/api/v1/sequences/{$seq->id}/versions")->assertOk();
        $versions->assertJsonCount(2);

        $versionId = $v1->json('id');
        $restore = $this->actingAs($user)->postJson("/api/v1/sequences/{$seq->id}/versions/{$versionId}/restore")->assertOk();
        $restore->assertJsonPath('body.rows.0', 'v1');
    }

    public function test_stale_etag_on_autosave_conflicts_instead_of_clobbering(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $etag = $this->actingAs($user)->getJson("/api/v1/sequences/{$seq->id}")->json('etag');

        $this->actingAs($user)->putJson("/api/v1/sequences/{$seq->id}/body", [
            'body' => ['rows' => ['from tab A']],
        ])->assertOk();

        $conflict = $this->actingAs($user)->putJson("/api/v1/sequences/{$seq->id}/body", [
            'body' => ['rows' => ['from tab B']], 'if_match' => $etag,
        ]);
        $conflict->assertStatus(409)->assertJsonPath('current.body.rows.0', 'from tab A');
    }
}

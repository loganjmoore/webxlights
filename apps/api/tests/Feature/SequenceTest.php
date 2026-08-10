<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SequenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    public function test_a_user_can_create_a_sequence_and_list_it(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();

        $response = $this->actingAs($user)->postJson("/api/v1/projects/{$project->id}/sequences", [
            'name' => 'Carol of the Bells',
            'frame_ms' => 25,
            'duration_ms' => 180000,
            'audio_filename' => 'carol.mp3',
        ]);
        $response->assertCreated()->assertJsonPath('name', 'Carol of the Bells')->assertJsonPath('frame_ms', 25);

        $list = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/sequences");
        $list->assertOk()->assertJsonCount(1);
    }

    public function test_frame_ms_must_be_one_of_the_spec_values(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();

        $response = $this->actingAs($user)->postJson("/api/v1/projects/{$project->id}/sequences", [
            'name' => 'Bad Frame Rate',
            'frame_ms' => 17,
            'duration_ms' => 1000,
        ]);
        $response->assertStatus(422);
    }

    public function test_autosave_persists_the_body_and_survives_reload(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $body = [
            'timingTracks' => [['name' => 'Beats', 'marks' => [0, 500, 1000]]],
            'rows' => [[
                'elementType' => 'model',
                'elementId' => 1,
                'effects' => [['id' => 'e1', 'name' => 'On', 'startMs' => 0, 'endMs' => 5000, 'params' => ['startIntensity' => 100]]],
            ]],
        ];

        $save = $this->actingAs($user)->putJson("/api/v1/sequences/{$seq->id}/body", ['body' => $body]);
        $save->assertOk();

        $reload = $this->actingAs($user)->getJson("/api/v1/sequences/{$seq->id}");
        $reload->assertOk()->assertJsonPath('body.rows.0.effects.0.name', 'On');
    }

    public function test_a_user_cannot_touch_another_users_sequence(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $this->actingAs($intruder)->getJson("/api/v1/sequences/{$seq->id}")->assertForbidden();
        $this->actingAs($intruder)->putJson("/api/v1/sequences/{$seq->id}/body", ['body' => []])->assertForbidden();
    }
}

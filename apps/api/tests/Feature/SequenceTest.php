<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_a_user_can_upload_and_fetch_back_sequence_audio(): void
    {
        Storage::fake('audio');
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $upload = $this->actingAs($user)->post("/api/v1/sequences/{$seq->id}/audio", [
            'audio' => UploadedFile::fake()->create('carol.mp3', 500, 'audio/mpeg'),
        ]);
        $upload->assertOk();
        $this->assertNotNull($seq->fresh()->audio_path);
        Storage::disk('audio')->assertExists($seq->fresh()->audio_path);

        $fetch = $this->actingAs($user)->get("/api/v1/sequences/{$seq->id}/audio");
        $fetch->assertOk();
    }

    public function test_re_uploading_audio_replaces_the_stored_file_and_deletes_the_old_one(): void
    {
        Storage::fake('audio');
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $this->actingAs($user)->post("/api/v1/sequences/{$seq->id}/audio", [
            'audio' => UploadedFile::fake()->create('first.mp3', 100, 'audio/mpeg'),
        ]);
        $firstPath = $seq->fresh()->audio_path;

        $this->actingAs($user)->post("/api/v1/sequences/{$seq->id}/audio", [
            'audio' => UploadedFile::fake()->create('second.mp3', 100, 'audio/mpeg'),
        ]);

        Storage::disk('audio')->assertMissing($firstPath);
        Storage::disk('audio')->assertExists($seq->fresh()->audio_path);
    }

    public function test_a_user_cannot_upload_or_fetch_audio_for_another_users_sequence(): void
    {
        Storage::fake('audio');
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $this->actingAs($intruder)->post("/api/v1/sequences/{$seq->id}/audio", [
            'audio' => UploadedFile::fake()->create('carol.mp3', 100, 'audio/mpeg'),
        ])->assertForbidden();
        $this->actingAs($intruder)->get("/api/v1/sequences/{$seq->id}/audio")->assertForbidden();
    }
}

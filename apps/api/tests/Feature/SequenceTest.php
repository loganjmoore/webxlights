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

    // xLights' Sequence Settings dialog (File > Sequence Settings). Before this there was no way
    // to change a sequence at all after creating it - not its name, not its length, not its frame
    // rate.
    public function test_sequence_settings_can_be_changed_after_creation(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create([
            'name' => 'Draft', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []],
        ]);

        $response = $this->actingAs($user)->patchJson("/api/v1/sequences/{$sequence->id}", [
            'name' => 'Carol of the Bells',
            'duration_ms' => 180000,
            'sequence_type' => 'animated',
            'blend_between_models' => true,
            'metadata' => ['author' => 'Someone', 'song' => 'Carol of the Bells'],
        ]);

        $response->assertOk()
            ->assertJsonPath('name', 'Carol of the Bells')
            ->assertJsonPath('sequence_type', 'animated')
            ->assertJsonPath('blend_between_models', true)
            ->assertJsonPath('metadata.author', 'Someone');
    }

    public function test_settings_left_out_of_the_patch_are_left_alone(): void
    {
        // A dialog that saves one field shouldn't blank the rest, and the frame rate in particular
        // changes what renders.
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create([
            'name' => 'Keep me', 'frame_ms' => 25, 'duration_ms' => 5000, 'body' => ['timingTracks' => [], 'rows' => []],
        ]);

        $this->actingAs($user)->patchJson("/api/v1/sequences/{$sequence->id}", ['duration_ms' => 9000])->assertOk();

        $sequence->refresh();
        $this->assertSame('Keep me', $sequence->name);
        $this->assertSame(25, $sequence->frame_ms);
        $this->assertSame(9000, $sequence->duration_ms);
    }

    public function test_settings_reject_a_frame_rate_the_exporter_cannot_write(): void
    {
        // The same rule the create endpoint has: a sequence rendered at an unknown rate would
        // produce an .fseq nothing can play.
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create([
            'name' => 'S', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []],
        ]);

        $this->actingAs($user)
            ->patchJson("/api/v1/sequences/{$sequence->id}", ['frame_ms' => 37])
            ->assertStatus(422);

        $this->actingAs($user)
            ->patchJson("/api/v1/sequences/{$sequence->id}", ['sequence_type' => 'interpretive dance'])
            ->assertStatus(422);
    }

    public function test_a_viewer_cannot_change_sequence_settings(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = Project::factory()->for($owner, 'owner')->create();
        $this->actingAs($owner)->postJson("/api/v1/projects/{$project->id}/members", [
            'email' => $viewer->email, 'role' => 'viewer',
        ])->assertCreated();
        $sequence = $project->sequences()->create([
            'name' => 'S', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []],
        ]);

        $this->actingAs($viewer)
            ->patchJson("/api/v1/sequences/{$sequence->id}", ['name' => 'Mine now'])
            ->assertForbidden();
    }

    // The "animated" type has existed since Sequence Settings landed and nothing could produce
    // one: every path to a new sequence went through picking an audio file.
    public function test_a_sequence_can_be_created_without_audio(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();

        $this->actingAs($user)->postJson("/api/v1/projects/{$project->id}/sequences", [
            'name' => 'Animated',
            'frame_ms' => 50,
            'duration_ms' => 60000,
            'sequence_type' => 'animated',
            'blend_between_models' => true,
        ])->assertCreated()
            ->assertJsonPath('sequence_type', 'animated')
            ->assertJsonPath('blend_between_models', true)
            ->assertJsonPath('audio_filename', null);
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

    // The old file is still the project's: it stays in Files, unused, and is deleted from there.
    public function test_re_uploading_audio_points_the_sequence_at_the_new_file_and_keeps_the_old_one_in_files(): void
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

        Storage::disk('audio')->assertExists($firstPath);
        Storage::disk('audio')->assertExists($seq->fresh()->audio_path);
        $this->assertSame('second.mp3', $seq->fresh()->audio_filename);
        $files = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/media")->assertJsonCount(2);
        $this->assertSame([], $files->json('1.used_by'));
        $this->assertSame('Show', $files->json('0.used_by.0.name'));
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

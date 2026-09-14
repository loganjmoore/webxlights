<?php

namespace Tests\Feature;

use App\Models\Media;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('audio');
        $this->withHeader('Referer', 'http://localhost:5173');
    }

    private function owned(): array
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();

        return [$user, $project];
    }

    public function test_uploaded_files_are_listed_with_their_kind_and_size(): void
    {
        [$user, $project] = $this->owned();

        $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('carol.mp3', 120, 'audio/mpeg'),
        ])->assertCreated()->assertJsonPath('kind', 'audio')->assertJsonPath('name', 'carol')->assertJsonPath('filename', 'carol.mp3');
        $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->image('santa.png', 32, 32),
        ])->assertCreated()->assertJsonPath('kind', 'image');
        $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('evil.html', 1, 'text/html'),
        ])->assertUnprocessable();

        $list = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/media");
        $list->assertOk()->assertJsonCount(2);
        $this->assertSame(120 * 1024, $list->json('1.size_bytes'));
        $this->assertSame([], $list->json('1.used_by'));
    }

    public function test_audio_upload_size_limit_matches_the_browser_and_server(): void
    {
        [$user, $project] = $this->owned();
        $sequence = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 1000]);

        foreach ([
            ["/api/v1/projects/{$project->id}/media", 'file', 201],
            ["/api/v1/sequences/{$sequence->id}/audio", 'audio', 200],
        ] as [$url, $field, $success]) {
            $this->actingAs($user)->post($url, [
                $field => UploadedFile::fake()->create('large.wav', 51200, 'audio/wav'),
            ])->assertStatus($success);
            $this->actingAs($user)->post($url, [
                $field => UploadedFile::fake()->create('too-large.wav', 51201, 'audio/wav'),
            ])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }

    public function test_renaming_changes_the_name_and_not_the_file(): void
    {
        [$user, $project] = $this->owned();
        $media = $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('carol.mp3', 10, 'audio/mpeg'),
        ])->json();
        $path = Media::find($media['id'])->path;

        $this->actingAs($user)->patchJson("/api/v1/media/{$media['id']}", ['name' => 'Carol of the Bells'])
            ->assertOk()->assertJsonPath('name', 'Carol of the Bells')->assertJsonPath('filename', 'carol.mp3');
        $this->assertSame($path, Media::find($media['id'])->path);
    }

    public function test_a_file_a_sequence_is_set_to_cannot_be_deleted_and_says_which(): void
    {
        [$user, $project] = $this->owned();
        $media = $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('carol.mp3', 10, 'audio/mpeg'),
        ])->json();

        $this->actingAs($user)->postJson("/api/v1/projects/{$project->id}/sequences", [
            'name' => 'Carol', 'frame_ms' => 25, 'duration_ms' => 1000, 'media_id' => $media['id'],
        ])->assertCreated()->assertJsonPath('audio_filename', 'carol.mp3');

        $list = $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/media");
        $this->assertSame('Carol', $list->json('0.used_by.0.name'));

        $this->actingAs($user)->deleteJson("/api/v1/media/{$media['id']}")
            ->assertStatus(409)->assertJsonPath('used_by.0', 'Carol');
        Storage::disk('audio')->assertExists(Media::find($media['id'])->path);
    }

    public function test_deleting_an_unused_file_removes_it_from_disk(): void
    {
        [$user, $project] = $this->owned();
        $media = $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('spare.mp3', 10, 'audio/mpeg'),
        ])->json();
        $path = Media::find($media['id'])->path;

        $this->actingAs($user)->deleteJson("/api/v1/media/{$media['id']}")->assertNoContent();
        Storage::disk('audio')->assertMissing($path);
        $this->assertNull(Media::find($media['id']));
    }

    public function test_deleting_a_sequence_keeps_its_soundtrack_in_files(): void
    {
        [$user, $project] = $this->owned();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);
        $this->actingAs($user)->post("/api/v1/sequences/{$seq->id}/audio", [
            'audio' => UploadedFile::fake()->create('carol.mp3', 10, 'audio/mpeg'),
        ])->assertOk();
        $path = $seq->fresh()->audio_path;

        // Uploading from the sequencer lists the file the same as uploading from Files.
        $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/media")->assertJsonCount(1)->assertJsonPath('0.used_by.0.name', 'Show');

        $this->actingAs($user)->deleteJson("/api/v1/sequences/{$seq->id}")->assertNoContent();
        $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/sequences")->assertJsonCount(0);
        Storage::disk('audio')->assertExists($path);
        $this->actingAs($user)->getJson("/api/v1/projects/{$project->id}/media")->assertJsonCount(1)->assertJsonPath('0.used_by', []);
    }

    public function test_only_members_see_a_file_and_only_editors_change_files(): void
    {
        [$user, $project] = $this->owned();
        $media = $this->actingAs($user)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('carol.mp3', 10, 'audio/mpeg'),
        ])->json();
        $seq = $project->sequences()->create(['name' => 'Show', 'frame_ms' => 50, 'duration_ms' => 60000]);

        $stranger = User::factory()->create();
        $this->actingAs($stranger)->get("/api/v1/media/{$media['id']}/file")->assertForbidden();
        $this->actingAs($stranger)->getJson("/api/v1/projects/{$project->id}/media")->assertForbidden();

        $viewer = User::factory()->create();
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);
        $this->actingAs($viewer)->get("/api/v1/media/{$media['id']}/file")->assertOk();
        $this->actingAs($viewer)->deleteJson("/api/v1/media/{$media['id']}")->assertForbidden();
        $this->actingAs($viewer)->deleteJson("/api/v1/sequences/{$seq->id}")->assertForbidden();
        $this->actingAs($viewer)->post("/api/v1/projects/{$project->id}/media", [
            'file' => UploadedFile::fake()->create('x.mp3', 1, 'audio/mpeg'),
        ])->assertForbidden();
    }
}

<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LibraryTest extends TestCase
{
    use RefreshDatabase;

    /** A project with one layout, a matrix and an arch, and a sequence with effects on both. */
    private function showWithSequence(User $user, bool $audio = true): array
    {
        Storage::fake('audio');
        $project = Project::factory()->for($user, 'owner')->create();
        $layout = $project->layouts()->create(['name' => 'Home']);
        $matrix = $layout->models()->create(['name' => 'Garage Matrix', 'type' => 'Matrix', 'params' => []]);
        $arch = $layout->models()->create(['name' => 'Arch 1', 'type' => 'Arches', 'params' => []]);
        $sequence = $project->sequences()->create([
            'name' => 'Carol', 'frame_ms' => 50, 'duration_ms' => 4000,
            'body' => [
                'timingTracks' => [['name' => 'Beats', 'marks' => [0, 1000, 2000]]],
                'rows' => [
                    ['elementType' => 'model', 'elementId' => $matrix->id, 'effects' => [['id' => 'a', 'name' => 'ColorWash', 'startMs' => 0, 'endMs' => 1000, 'params' => []]]],
                    ['elementType' => 'model', 'elementId' => $arch->id, 'effects' => [['id' => 'b', 'name' => 'On', 'startMs' => 0, 'endMs' => 500, 'params' => []]]],
                    ['elementType' => 'model', 'elementId' => 9999, 'effects' => []],
                ],
            ],
        ]);
        if ($audio) {
            $path = UploadedFile::fake()->create('carol.mp3', 10, 'audio/mpeg')->store("sequences/{$sequence->id}", 'audio');
            $sequence->update(['audio_path' => $path, 'audio_filename' => 'carol.mp3']);
        }

        return [$project, $sequence];
    }

    public function test_publishing_freezes_the_sequence_with_the_names_its_rows_were_written_for(): void
    {
        $user = User::factory()->create();
        [, $sequence] = $this->showWithSequence($user);

        $response = $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/publish", [
            'title' => 'Carol of the Bells', 'description' => 'Fast one.', 'include_audio' => true,
        ]);
        $response->assertCreated()
            ->assertJsonPath('title', 'Carol of the Bells')
            ->assertJsonPath('has_audio', true)
            ->assertJsonPath('donors.0.name', 'Garage Matrix')
            ->assertJsonPath('donors.0.type', 'Matrix')
            ->assertJsonPath('donors.1.name', 'Arch 1')
            ->assertJsonPath('timing_track_names', ['Beats']);
        $this->assertCount(2, $response->json('donors'));

        // The audio is a copy: the original can change without touching the library.
        Storage::disk('audio')->assertExists("library/{$response->json('id')}/audio.mp3");
        $sequence->update(['body' => ['rows' => [], 'timingTracks' => []]]);
        $this->actingAs($user)->getJson("/api/v1/library/{$response->json('id')}")->assertOk()->assertJsonCount(3, 'body.rows');
    }

    public function test_audio_stays_home_unless_the_publisher_says_it_may_travel(): void
    {
        $user = User::factory()->create();
        [, $sequence] = $this->showWithSequence($user);
        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/publish", ['title' => 'Carol'])
            ->assertCreated()->assertJsonPath('has_audio', false);
    }

    public function test_an_empty_sequence_cannot_be_shared(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create(['name' => 'Blank', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['rows' => [], 'timingTracks' => []]]);
        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/publish", ['title' => 'Blank'])->assertStatus(422);
    }

    public function test_everyone_signed_in_can_browse_and_search_and_copy_onto_their_own_project(): void
    {
        $author = User::factory()->create(['name' => 'Ada']);
        [, $sequence] = $this->showWithSequence($author);
        $this->actingAs($author)->postJson("/api/v1/sequences/{$sequence->id}/publish", ['title' => 'Carol of the Bells', 'include_audio' => true])->assertCreated();

        $someone = User::factory()->create();
        $list = $this->actingAs($someone)->getJson('/api/v1/library?q=bells')->assertOk();
        $list->assertJsonPath('data.0.title', 'Carol of the Bells')->assertJsonPath('data.0.author.name', 'Ada');
        $this->actingAs($someone)->getJson('/api/v1/library?q=nothing-like-this')->assertOk()->assertJsonCount(0, 'data');
        $id = $list->json('data.0.id');

        // The browser has mapped the rows onto this person's own models; the copy lands in their project.
        $mine = Project::factory()->for($someone, 'owner')->create();
        $copy = $this->actingAs($someone)->postJson("/api/v1/library/{$id}/copy", [
            'project_id' => $mine->id,
            'name' => 'Carol (from the library)',
            'body' => ['timingTracks' => [], 'rows' => [['elementType' => 'model', 'elementId' => 42, 'effects' => []]]],
        ]);
        $copy->assertCreated()->assertJsonPath('project_id', $mine->id)->assertJsonPath('audio_filename', 'carol.mp3')->assertJsonPath('frame_ms', 50);
        $this->assertDatabaseHas('sequences', ['id' => $copy->json('id'), 'project_id' => $mine->id]);
        Storage::disk('audio')->assertExists("sequences/{$copy->json('id')}/carol.mp3");
        $this->actingAs($someone)->getJson("/api/v1/library/{$id}")->assertJsonPath('uses', 1);

        // The library's audio is readable by anyone signed in; the original sequence is still not.
        $this->actingAs($someone)->get("/api/v1/library/{$id}/audio")->assertOk();
        $this->actingAs($someone)->getJson("/api/v1/sequences/{$sequence->id}/audio")->assertForbidden();
    }

    public function test_copying_into_a_project_you_cannot_edit_is_refused(): void
    {
        $author = User::factory()->create();
        [, $sequence] = $this->showWithSequence($author, false);
        $id = $this->actingAs($author)->postJson("/api/v1/sequences/{$sequence->id}/publish", ['title' => 'Carol'])->json('id');
        $other = User::factory()->create();
        $theirs = Project::factory()->for($other, 'owner')->create();
        $me = User::factory()->create();
        $this->actingAs($me)->postJson("/api/v1/library/{$id}/copy", ['project_id' => $theirs->id, 'name' => 'x', 'body' => ['rows' => [], 'timingTracks' => []]])->assertForbidden();
    }

    public function test_only_the_publisher_can_take_an_entry_down(): void
    {
        $author = User::factory()->create();
        [, $sequence] = $this->showWithSequence($author);
        $id = $this->actingAs($author)->postJson("/api/v1/sequences/{$sequence->id}/publish", ['title' => 'Carol', 'include_audio' => true])->json('id');
        $this->actingAs(User::factory()->create())->deleteJson("/api/v1/library/{$id}")->assertForbidden();
        $this->actingAs($author)->deleteJson("/api/v1/library/{$id}")->assertNoContent();
        Storage::disk('audio')->assertMissing("library/{$id}/audio.mp3");
        $this->assertDatabaseMissing('library_sequences', ['id' => $id]);
    }

    public function test_the_library_needs_a_signed_in_person(): void
    {
        $this->getJson('/api/v1/library')->assertUnauthorized();
    }
}

<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Sequence;
use App\Models\User;
use App\Services\LyricAligner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LyricAlignmentTest extends TestCase
{
    use RefreshDatabase;

    private function sequenceWithAudio(User $user): Sequence
    {
        Storage::fake('audio');
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create(['name' => 'Carol', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []]]);
        $path = UploadedFile::fake()->create('song.mp3', 200, 'audio/mpeg')->store("sequences/{$sequence->id}", 'audio');
        $sequence->update(['audio_path' => $path, 'audio_filename' => 'song.mp3']);

        return $sequence;
    }

    public function test_pasting_lyrics_listens_to_the_song_and_stores_the_words(): void
    {
        config(['services.lyrics.key' => 'test-key', 'services.lyrics.base_url' => 'https://stt.example/v1']);
        Http::fake([
            'stt.example/v1/audio/transcriptions' => Http::response([
                'language' => 'english',
                'words' => [
                    ['word' => 'Jingle', 'start' => 1.0, 'end' => 1.4],
                    ['word' => 'bells', 'start' => 1.5, 'end' => 2.0],
                ],
            ]),
        ]);
        $user = User::factory()->create();
        $sequence = $this->sequenceWithAudio($user);

        $response = $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => "Jingle bells\nJingle all the way"]);
        $response->assertStatus(202)->assertJsonPath('status', 'queued');

        // The listen ran after the response; the next poll has the words and the dictionary's
        // pronunciations for the lyrics that are in it.
        $latest = $this->actingAs($user)->getJson("/api/v1/sequences/{$sequence->id}/lyrics")->assertOk();
        $latest->assertJsonPath('status', 'done')
            ->assertJsonPath('result.words.1.text', 'bells')
            ->assertJsonPath('result.words.1.start', 1.5)
            ->assertJsonPath('result.pronunciations.jingle', ['JH', 'IH1', 'NG', 'G', 'AH0', 'L'])
            ->assertJsonPath('result.pronunciations.way', ['W', 'EY1']);

        Http::assertSent(function ($request) {
            // A multipart body: the fields are parts, each with a name and contents.
            $fields = collect($request->data())->pluck('contents', 'name');

            return $request->hasHeader('Authorization', 'Bearer test-key')
                && $fields['model'] === 'whisper-1'
                && str_starts_with($fields['prompt'], 'Jingle bells')
                && $fields->has('file');
        });
        // Counted against the month.
        $this->assertDatabaseHas('credit_transactions', ['user_id' => $user->id, 'reason' => 'lyric_alignment']);
    }

    public function test_without_audio_there_is_nothing_to_listen_to(): void
    {
        config(['services.lyrics.key' => 'test-key']);
        $user = User::factory()->create();
        $project = Project::factory()->for($user, 'owner')->create();
        $sequence = $project->sequences()->create(['name' => 'Carol', 'frame_ms' => 50, 'duration_ms' => 1000, 'body' => ['timingTracks' => [], 'rows' => []]]);

        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])
            ->assertStatus(422)->assertJsonPath('code', 'no_audio');
    }

    public function test_a_failed_listen_is_reported_and_gives_the_slot_back(): void
    {
        config(['services.lyrics.key' => 'test-key', 'services.lyrics.base_url' => 'https://stt.example/v1', 'services.lyrics.monthly_limit' => 1]);
        Http::fake(['stt.example/*' => Http::response(['error' => ['message' => 'file too noisy']], 400)]);
        $user = User::factory()->create();
        $sequence = $this->sequenceWithAudio($user);

        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])->assertStatus(202);
        $this->actingAs($user)->getJson("/api/v1/sequences/{$sequence->id}/lyrics")
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('error', 'The transcription service refused the audio: file too noisy');

        // The failed one was refunded, so the single monthly slot is still there.
        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])->assertStatus(202);
    }

    public function test_the_monthly_allowance_stops_the_next_one(): void
    {
        config(['services.lyrics.key' => 'test-key', 'services.lyrics.base_url' => 'https://stt.example/v1', 'services.lyrics.monthly_limit' => 1]);
        Http::fake(['stt.example/*' => Http::response(['words' => []])]);
        $user = User::factory()->create();
        $sequence = $this->sequenceWithAudio($user);

        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])->assertStatus(202);
        $this->actingAs($user)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])
            ->assertStatus(429)->assertJsonPath('code', 'monthly_limit');
    }

    public function test_someone_outside_the_project_cannot_start_or_read_one(): void
    {
        config(['services.lyrics.key' => 'test-key']);
        $owner = User::factory()->create();
        $sequence = $this->sequenceWithAudio($owner);
        $stranger = User::factory()->create();

        $this->actingAs($stranger)->postJson("/api/v1/sequences/{$sequence->id}/lyrics", ['lyrics' => 'la la la'])->assertForbidden();
        $this->actingAs($stranger)->getJson("/api/v1/sequences/{$sequence->id}/lyrics")->assertForbidden();
    }

    public function test_the_dictionary_knows_how_words_are_said(): void
    {
        $said = app(LyricAligner::class)->pronunciations(['Christmas,', 'LIGHTS', 'xyzzyq']);
        $this->assertSame(['K', 'R', 'IH1', 'S', 'M', 'AH0', 'S'], $said['christmas']);
        $this->assertSame(['L', 'AY1', 'T', 'S'], $said['lights']);
        $this->assertArrayNotHasKey('xyzzyq', $said);
    }
}

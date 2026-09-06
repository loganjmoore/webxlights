<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

// A project's files: the audio and images people upload, as things you can see, rename and
// delete, rather than as a path hidden on whichever sequence happened to upload them. A
// sequence still points at its soundtrack by path; a media row is the file's name in the list,
// and "used by" is every sequence whose audio_path is that path.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('kind'); // audio | image
            $table->string('name'); // what the list shows; renaming changes only this
            $table->string('filename'); // the name the file was uploaded with, extension included
            $table->string('path')->index(); // key on the 'audio' disk (the persistent disk in prod)
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();
        });

        // Every soundtrack uploaded before this table existed shows up in Files from day one,
        // otherwise the page would open empty on a project full of audio.
        $disk = Storage::disk('audio');
        foreach (DB::table('sequences')->whereNotNull('audio_path')->orderBy('id')->get() as $s) {
            $filename = $s->audio_filename ?: basename($s->audio_path);
            DB::table('media')->insert([
                'project_id' => $s->project_id,
                'kind' => 'audio',
                'name' => pathinfo($filename, PATHINFO_FILENAME) ?: $filename,
                'filename' => $filename,
                'path' => $s->audio_path,
                'mime' => null,
                'size_bytes' => $disk->exists($s->audio_path) ? (int) $disk->size($s->audio_path) : 0,
                'created_at' => $s->created_at,
                'updated_at' => $s->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};

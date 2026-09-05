<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// One automatic lyric timing per request: the lyrics somebody pasted, and, once the audio has
// been listened to, the words that were heard with their times and their dictionary
// pronunciations. The browser turns that into timing tracks; the row is what it polls.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lyric_alignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sequence_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('queued'); // queued | running | done | failed
            $table->text('lyrics');
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lyric_alignments');
    }
};

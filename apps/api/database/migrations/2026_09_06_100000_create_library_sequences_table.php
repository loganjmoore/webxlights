<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The shared sequence library: a published copy of a sequence, frozen at publish time, with the
// names of the models its rows were written for so someone else can map them onto their own
// layout. Audio is optional and only copied when the publisher says they may share it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('library_sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->json('body');
            // [{name, elementType, elementId, type, effectCount}] - the rows as the publisher's layout named them.
            $table->json('donors');
            $table->unsignedInteger('frame_ms');
            $table->unsignedInteger('duration_ms');
            $table->string('audio_filename')->nullable();
            $table->string('audio_path')->nullable();
            $table->unsignedInteger('uses')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('library_sequences');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// What somebody changed in a Magic Sequence, shared by them on purpose: per kind of prop, the
// effects Magic placed and the effects there now, with the song's sections. Features only, never
// audio, names or a layout. It is the paired data a learned effect picker needs
// (docs/MAGIC-SEQUENCE.md 6.3). One row per person per sequence: sharing again replaces it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('magic_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sequence_id')->constrained()->cascadeOnDelete();
            $table->json('payload');
            $table->timestamps();
            $table->unique(['user_id', 'sequence_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_feedback');
    }
};

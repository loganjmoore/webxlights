<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Pictures for the matrix drawn by an image model, one row per thing drawn ("boots on a snowy
// roof"). Kept for everyone: the next person whose song names the same thing gets this drawing
// for nothing. subject_key is the subject as cleaned plus the drawing style's version, so a new
// style draws everything afresh rather than mixing looks.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('magic_pictures', function (Blueprint $table) {
            $table->id();
            $table->string('subject', 120);
            $table->string('subject_key', 64)->unique();
            $table->string('status', 16)->default('queued'); // queued | running | done | failed
            $table->string('path')->nullable();
            $table->string('model', 60)->nullable();
            $table->text('error')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_pictures');
    }
};

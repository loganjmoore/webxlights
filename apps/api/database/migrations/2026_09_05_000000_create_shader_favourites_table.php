<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A person's own collection out of the gallery. One row per (person, shader); deleting either
// side deletes the bookmark, because a favourite of nothing is nothing.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shader_favourites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shader_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'shader_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shader_favourites');
    }
};

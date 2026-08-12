<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// M15.7: real xLights' <view_objects> (Gridlines, Mesh, Terrain, Ruler, Image, Controller) -
// a separate XML element from <models>, previously not parsed at all so every real show's
// Gridlines helper was silently dropped on import. Mirrors the `models` table's shape (kept
// even when unsupported, lossless raw_attrs) rather than inventing a new convention.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('view_objects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('layout_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type'); // DisplayAs, e.g. "Gridlines", "Mesh"
            $table->boolean('supported')->default(false); // only Gridlines renders today
            $table->jsonb('raw_attrs')->default('{}'); // full imported XML attribute bag (lossless)
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('view_objects');
    }
};

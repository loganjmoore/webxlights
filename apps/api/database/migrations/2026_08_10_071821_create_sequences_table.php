<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->integer('frame_ms')->default(50); // SPEC ch6: 20/25/33/40/50ms
            $table->integer('duration_ms')->default(0);
            $table->string('audio_filename')->nullable(); // client-cached only until R2 exists (M2 deviation)
            // { timingTracks: [{name, marks:[ms]}], rows: [{elementType, elementId, effects:[{id,name,startMs,endMs,params}]}] }
            $table->jsonb('body')->default('{}');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sequences');
    }
};

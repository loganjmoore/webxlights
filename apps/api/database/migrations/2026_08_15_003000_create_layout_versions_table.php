<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Snapshots of a layout, the way sequence_versions snapshots a sequence.
//
// xLights' periodic backup covers "the xlights_rgbeffects.xml... This includes the layout as
// well". Sequences here have had version history since M-early; the layout - models, their
// sub-models, states and faces, groups, view objects, views and presets - had nothing at all. A
// mis-drag on the layout page or a bad import was unrecoverable.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('layout_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('layout_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->jsonb('snapshot');
            // 'manual' or 'auto'. Kept because retention differs: the periodic ones are pruned and
            // the ones someone deliberately took are not.
            $table->string('reason', 16)->default('manual');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->unique(['layout_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('layout_versions');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// xLights' Sequence Settings dialog (File > Sequence Settings). Its Info/Media tab carries the
// sequence type and the blending rule, and its Metadata tab a set of free-text fields about the
// song. Neither had anywhere to live: a sequence could be created with a name, a frame rate and a
// duration, and then never changed again.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sequences', function (Blueprint $table) {
            // "Media or Animated" - an animated sequence has no soundtrack, which is what the
            // distinction is for rather than it being a label.
            $table->string('sequence_type')->default('media');
            // "Decides whether effects from the model groups blend with model level effects."
            // Off matches what the renderer already did: a model's own effects win where they
            // draw, and the group shows through where they don't.
            $table->boolean('blend_between_models')->default(false);
            // The Metadata tab: author, email, website, song, artist, album, music URL, comment.
            // One column rather than eight, because nothing queries them - they travel with the
            // sequence and are read back whole.
            $table->json('metadata')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('sequences', function (Blueprint $table) {
            $table->dropColumn(['sequence_type', 'blend_between_models', 'metadata']);
        });
    }
};

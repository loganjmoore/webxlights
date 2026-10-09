<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Lyric timing with nothing pasted: the words come from listening to the song (Magic Sequence
// starts one itself), so the alignment row may have no lyrics of its own.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lyric_alignments', function (Blueprint $table) {
            $table->text('lyrics')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('lyric_alignments', function (Blueprint $table) {
            $table->text('lyrics')->nullable(false)->change();
        });
    }
};

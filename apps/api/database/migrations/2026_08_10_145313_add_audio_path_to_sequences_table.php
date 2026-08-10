<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('sequences', function (Blueprint $table) {
            $table->string('audio_path')->nullable(); // key on the 'audio' disk (Render persistent disk in prod)
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sequences', function (Blueprint $table) {
            $table->dropColumn('audio_path');
        });
    }
};

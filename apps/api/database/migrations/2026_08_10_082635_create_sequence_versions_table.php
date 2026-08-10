<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sequence_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sequence_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->jsonb('body');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->unique(['sequence_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sequence_versions');
    }
};

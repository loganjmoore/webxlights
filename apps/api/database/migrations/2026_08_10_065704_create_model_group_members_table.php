<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('model_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('model_groups')->cascadeOnDelete();
            $table->foreignId('model_id')->constrained('models')->cascadeOnDelete();
            $table->integer('order')->default(0);
            $table->unique(['group_id', 'model_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('model_group_members');
    }
};

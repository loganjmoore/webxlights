<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('models', function (Blueprint $table) {
            $table->id();
            $table->foreignId('layout_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type'); // DisplayAs, e.g. "Matrix", "Tree" - kept even when unsupported
            $table->boolean('supported')->default(true);
            $table->jsonb('params')->default('{}'); // typed params the engine's geometry fns take
            $table->jsonb('raw_attrs')->default('{}'); // full imported XML attribute bag (lossless)
            $table->jsonb('screen')->default('{}'); // {x, y, scale, rotate} on the 2D layout canvas
            $table->integer('strings')->nullable();
            $table->integer('nodes_per_string')->nullable();
            $table->string('string_type')->nullable();
            $table->string('start_channel')->nullable(); // free-form: plain int, "#u:c", ">model:c"...
            $table->integer('channel_count')->nullable();
            $table->integer('order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('models');
    }
};

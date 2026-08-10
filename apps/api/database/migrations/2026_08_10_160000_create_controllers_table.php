<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('controllers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('protocol')->default('ddp'); // ddp|ethernet|null|usb - DDP first, see DECISIONS.md M11
            $table->string('ip_address')->nullable();
            $table->integer('start_channel')->default(1); // user-authoritative, not auto-allocated - see export notes
            $table->integer('channel_count')->default(0);
            $table->string('vendor')->nullable();
            $table->string('model')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('controllers');
    }
};

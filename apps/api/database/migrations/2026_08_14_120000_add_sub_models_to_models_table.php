<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// xLights stores SubModels as <subModel> elements nested inside <model>, not as attributes, so
// the lossless raw_attrs bag never carried them. They belong to exactly one model and are
// meaningless without it, so they ride along on the model row rather than earning a table.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->json('sub_models')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->dropColumn('sub_models');
        });
    }
};

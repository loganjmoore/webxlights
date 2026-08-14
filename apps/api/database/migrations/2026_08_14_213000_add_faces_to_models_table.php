<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// xLights face definitions: which of a model's nodes are the mouth in each phoneme, and which are
// the eyes and outline. Stored inside the <model> element like sub-models and states, so raw_attrs
// never carried them, and meaningless apart from the model they belong to.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->json('faces')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->dropColumn('faces');
        });
    }
};

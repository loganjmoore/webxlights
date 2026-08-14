<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// xLights model States: named sets of a model's nodes ("wink", "eyesleft", the digits of a seven
// segment sign) that the State effect turns on by name. Like SubModels they live inside the
// <model> element rather than as attributes, so raw_attrs never carried them, and like SubModels
// they are meaningless apart from the model they belong to - so they ride on the model row.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->json('states')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->dropColumn('states');
        });
    }
};

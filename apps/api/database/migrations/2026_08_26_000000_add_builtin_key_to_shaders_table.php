<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Identity for the shaders that ship with the app rather than being made by a person.
//
// `builtin_key` is the stable id from packages/shaders/library (the file name: "candy-cane"),
// and it is what `shaders:publish-builtins` upserts on. It is deliberately NOT the row id, which
// differs per install, and not the name, which is display text someone may want to change.
// Without a stable key, every deploy would either duplicate the library or have to guess which
// existing row a built-in corresponds to.
//
// Nullable because every user-made shader has none, and unique so a re-deploy can only ever
// update the row it already published. Both Postgres and SQLite allow many NULLs under a unique
// index, which is what makes those two facts compatible.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shaders', function (Blueprint $table) {
            $table->string('builtin_key')->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('shaders', function (Blueprint $table) {
            $table->dropUnique(['builtin_key']);
            $table->dropColumn('builtin_key');
        });
    }
};

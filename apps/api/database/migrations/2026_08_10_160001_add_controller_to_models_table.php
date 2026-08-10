<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->foreignId('controller_id')->nullable()->constrained('controllers')->nullOnDelete();
            $table->integer('controller_offset')->nullable(); // 0-based byte offset within the controller's span
        });
    }

    public function down(): void
    {
        Schema::table('models', function (Blueprint $table) {
            $table->dropConstrainedForeignId('controller_id');
            $table->dropColumn('controller_offset');
        });
    }
};

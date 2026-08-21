<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The shader library. Unlike every other table here, a shader is not owned by a layout or a
// project - it is a piece of content one person makes and everyone can use, which is the whole
// point of the gallery. So it hangs off the user and nothing else.
//
// `source` is the GLSL body and `inputs` the parsed ISF INPUTS. Both are stored rather than only
// the raw ISF text, because the sequencer needs the inputs to build its controls and re-parsing
// on every render would be work done thousands of times to get the same answer.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shaders', function (Blueprint $table) {
            $table->id();
            // Kept when the author deletes their account: a published shader other people's
            // sequences already reference must not vanish out from under them. nullOnDelete
            // rather than cascade is that decision made explicit.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('source');
            $table->jsonb('inputs')->default('[]');
            $table->jsonb('categories')->default('[]');
            // Public by default. A shader nobody can find is a shader that may as well not be in
            // a gallery, and the toggle is there for the person who wants one private.
            $table->boolean('is_public')->default(true);
            // What the author asked the assistant for, kept alongside the result. It is the most
            // useful search text a generated shader has - people look for "swirling fire", not
            // for the GLSL - and it is how someone learns to write a better prompt.
            $table->text('prompt')->nullable();
            $table->boolean('ai_generated')->default(false);
            $table->unsignedInteger('use_count')->default(0);
            $table->timestamps();

            $table->index(['is_public', 'created_at']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shaders');
    }
};

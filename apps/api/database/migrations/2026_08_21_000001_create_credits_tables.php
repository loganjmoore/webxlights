<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Credits for the shader assistant.
//
// Two pieces, on purpose. `users.credits` is the balance the app reads on every request and has
// to be cheap; `credit_transactions` is the append-only ledger that says how the balance got
// there. Keeping only a balance makes "why do I have 3 credits" unanswerable and a double-charge
// undetectable; keeping only a ledger makes every balance check a SUM over a growing table.
//
// The ledger is the record of truth and the balance is a cache of it, which is why every write
// to one happens in the same transaction as the other.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Signing up comes with enough credits to actually try the thing. A generator you
            // cannot use until you have paid is one nobody discovers they want.
            $table->integer('credits')->default(10);
        });

        Schema::create('credit_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Negative for spend, positive for grants and purchases, so the ledger sums to the
            // balance and nothing has to know which kind a row is to add it up.
            $table->integer('amount');
            $table->string('reason'); // signup_grant | shader_generation | purchase | refund | adjustment
            $table->jsonb('meta')->default('{}');
            // The balance after this row, so a statement can be rendered without re-summing the
            // whole history to date for every line.
            $table->integer('balance_after');
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_transactions');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('credits');
        });
    }
};

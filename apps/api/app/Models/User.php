<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'owner_id');
    }

    public function shaders(): HasMany
    {
        return $this->hasMany(Shader::class);
    }

    public function creditTransactions(): HasMany
    {
        return $this->hasMany(CreditTransaction::class);
    }

    /**
     * Moves credits and writes the ledger row, as one indivisible step.
     *
     * Locks the user row first, so two requests that arrive together cannot both read the same
     * balance and both decide there is enough. Without that, the way to get free generations is
     * to press the button twice - and a credit system that can be beaten by double-clicking is
     * not one.
     *
     * Returns false when a spend would overdraw, having changed nothing. Grants (a positive
     * amount) always apply.
     */
    public function moveCredits(int $amount, string $reason, array $meta = []): bool
    {
        return DB::transaction(function () use ($amount, $reason, $meta) {
            /** @var self $locked */
            $locked = self::query()->lockForUpdate()->find($this->id);
            if ($locked === null) {
                return false;
            }
            $balance = $locked->credits + $amount;
            if ($balance < 0) {
                return false;
            }
            $locked->credits = $balance;
            $locked->save();
            $locked->creditTransactions()->create([
                'amount' => $amount,
                'reason' => $reason,
                'meta' => $meta,
                'balance_after' => $balance,
            ]);
            $this->credits = $balance;

            return true;
        });
    }

    // Projects shared with this user (not owned) via project_members.
    public function sharedProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_members')->withPivot('role');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}

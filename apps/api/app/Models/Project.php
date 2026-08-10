<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'settings'];

    protected function casts(): array
    {
        return ['settings' => 'array'];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function layouts(): HasMany
    {
        return $this->hasMany(Layout::class);
    }

    public function sequences(): HasMany
    {
        return $this->hasMany(Sequence::class);
    }

    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    public function controllers(): HasMany
    {
        return $this->hasMany(Controller::class);
    }

    // 'owner' (full control), 'editor' (read/write), 'viewer' (read-only), or null (no access).
    public function accessLevel(User $user): ?string
    {
        if ($this->owner_id === $user->id) {
            return 'owner';
        }

        return $this->members->firstWhere('user_id', $user->id)?->role;
    }

    // $need: 'viewer' (any access) or 'editor' (owner or editor role).
    public function authorize(User $user, string $need = 'viewer'): void
    {
        $level = $this->accessLevel($user);
        $ok = $need === 'editor' ? in_array($level, ['owner', 'editor']) : $level !== null;

        abort_unless($ok, 403);
    }
}

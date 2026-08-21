<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['name', 'description', 'source', 'inputs', 'categories', 'is_public', 'prompt', 'ai_generated'])]
class Shader extends Model
{
    protected function casts(): array
    {
        return [
            'inputs' => 'array',
            'categories' => 'array',
            'is_public' => 'boolean',
            'ai_generated' => 'boolean',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Everything in the gallery, plus the caller's own private ones. */
    public function scopeVisibleTo($query, ?int $userId)
    {
        return $query->where(function ($q) use ($userId) {
            $q->where('is_public', true);
            if ($userId !== null) {
                $q->orWhere('user_id', $userId);
            }
        });
    }
}

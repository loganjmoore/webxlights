<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Layout extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'settings'];

    protected function casts(): array
    {
        return ['settings' => 'array'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function models(): HasMany
    {
        return $this->hasMany(ModelEntity::class);
    }

    public function modelGroups(): HasMany
    {
        return $this->hasMany(ModelGroup::class);
    }
}

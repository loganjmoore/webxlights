<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Controller extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'protocol', 'ip_address', 'start_channel', 'channel_count', 'vendor', 'model', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function models(): HasMany
    {
        return $this->hasMany(ModelEntity::class);
    }
}

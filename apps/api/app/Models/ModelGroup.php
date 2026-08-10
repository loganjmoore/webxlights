<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ModelGroup extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'buffer_style', 'params'];

    protected function casts(): array
    {
        return ['params' => 'array'];
    }

    public function layout(): BelongsTo
    {
        return $this->belongsTo(Layout::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(ModelEntity::class, 'model_group_members', 'group_id', 'model_id')
            ->withPivot('order')
            ->orderByPivot('order');
    }
}

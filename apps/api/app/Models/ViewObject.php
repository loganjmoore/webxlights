<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ViewObject extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'type', 'supported', 'raw_attrs'];

    protected function casts(): array
    {
        return [
            'raw_attrs' => 'array',
            'supported' => 'boolean',
        ];
    }

    public function layout(): BelongsTo
    {
        return $this->belongsTo(Layout::class);
    }
}

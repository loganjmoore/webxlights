<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LayoutVersion extends Model
{
    use HasFactory;

    protected $fillable = ['layout_id', 'number', 'snapshot', 'reason', 'created_by'];

    protected function casts(): array
    {
        return ['snapshot' => 'array'];
    }

    public function layout(): BelongsTo
    {
        return $this->belongsTo(Layout::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

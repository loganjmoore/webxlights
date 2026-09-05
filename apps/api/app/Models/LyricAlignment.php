<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LyricAlignment extends Model
{
    protected $fillable = ['sequence_id', 'user_id', 'status', 'lyrics', 'result', 'error'];

    protected function casts(): array
    {
        return ['result' => 'array'];
    }

    public function sequence(): BelongsTo
    {
        return $this->belongsTo(Sequence::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

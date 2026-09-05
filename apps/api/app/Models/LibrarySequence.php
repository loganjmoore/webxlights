<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LibrarySequence extends Model
{
    protected $fillable = ['user_id', 'title', 'description', 'body', 'donors', 'frame_ms', 'duration_ms', 'audio_filename', 'audio_path', 'uses'];

    protected function casts(): array
    {
        return ['body' => 'array', 'donors' => 'array'];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MagicFeedback extends Model
{
    protected $table = 'magic_feedback';

    protected $fillable = ['user_id', 'sequence_id', 'payload'];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }
}

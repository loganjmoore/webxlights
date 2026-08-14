<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ModelEntity extends Model
{
    use HasFactory;

    protected $table = 'models';

    protected $fillable = [
        'name', 'type', 'supported', 'params', 'raw_attrs', 'screen',
        'strings', 'nodes_per_string', 'string_type', 'start_channel', 'channel_count', 'order',
        'controller_id', 'controller_offset', 'sub_models',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'raw_attrs' => 'array',
            'sub_models' => 'array',
            'screen' => 'array',
            'supported' => 'boolean',
        ];
    }

    public function layout(): BelongsTo
    {
        return $this->belongsTo(Layout::class);
    }

    public function controller(): BelongsTo
    {
        return $this->belongsTo(Controller::class);
    }
}

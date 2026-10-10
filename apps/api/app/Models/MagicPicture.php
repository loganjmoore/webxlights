<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MagicPicture extends Model
{
    protected $fillable = ['subject', 'subject_key', 'status', 'path', 'model', 'error', 'user_id'];
}

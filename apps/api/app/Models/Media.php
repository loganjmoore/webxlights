<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Media extends Model
{
    public const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'webm', 'mp4'];

    public const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

    protected $table = 'media';

    protected $fillable = ['kind', 'name', 'filename', 'path', 'mime', 'size_bytes'];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    // The sequences whose soundtrack is this file. Joined by path, not by a foreign key: a
    // sequence's audio_path predates this table, and a path is what the player fetches anyway.
    // Paths carry the project or sequence id, so one never belongs to two projects.
    public function sequences(): HasMany
    {
        return $this->hasMany(Sequence::class, 'audio_path', 'path');
    }

    public static function kindFor(string $filename): ?string
    {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (in_array($ext, self::AUDIO_EXTENSIONS)) {
            return 'audio';
        }
        if (in_array($ext, self::IMAGE_EXTENSIONS)) {
            return 'image';
        }

        return null;
    }

    // Records a file that is already on the disk, so an upload made from a sequence shows up in
    // Files the same as one made from the Files page.
    public static function record(Project $project, string $filename, string $path, ?string $mime = null, ?int $size = null): self
    {
        return $project->media()->create([
            'kind' => self::kindFor($filename) ?? 'audio',
            'name' => pathinfo($filename, PATHINFO_FILENAME) ?: $filename,
            'filename' => $filename,
            'path' => $path,
            'mime' => $mime,
            'size_bytes' => $size ?? (Storage::disk('audio')->exists($path) ? (int) Storage::disk('audio')->size($path) : 0),
        ]);
    }
}

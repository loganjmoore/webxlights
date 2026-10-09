<?php

namespace App\Console\Commands;

use App\Models\MagicFeedback;
use Illuminate\Console\Command;

// The shared Magic Sequence edits as JSON lines, one per sequence, for
// tools/sequence-corpus/train-picker.mjs. Payloads only: who shared them stays in the database.
class ExportMagicFeedback extends Command
{
    protected $signature = 'magic:export-feedback {path? : write here instead of standard output}';

    protected $description = 'Export shared Magic Sequence edits for training the effect picker';

    public function handle(): int
    {
        $lines = MagicFeedback::query()->orderBy('id')->pluck('payload')->map(fn ($p) => json_encode($p, JSON_UNESCAPED_SLASHES))->implode("\n");
        $path = $this->argument('path');
        if ($path) {
            file_put_contents($path, $lines === '' ? '' : $lines."\n");
            $this->info(MagicFeedback::count().' shared edits written to '.$path);
        } else {
            $this->line($lines);
        }

        return self::SUCCESS;
    }
}

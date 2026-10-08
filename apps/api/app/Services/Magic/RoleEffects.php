<?php

namespace App\Services\Magic;

/**
 * Which effects each prop role may use, in the corpus's preference order.
 *
 * database/data/magic-role-effects.json is generated from tools/sequence-corpus/priors.json and
 * mirrored in the browser (apps/web/src/lib/magic/roleEffects.ts). It is the whitelist the AI
 * director is held to: whatever the model says, an effect that is not listed for a role never
 * reaches the sequencer. A role with an empty list (moving heads) takes no effects at all.
 */
class RoleEffects
{
    private static ?array $table = null;

    /** @return array<string, string[]> role => effect names, best first */
    public static function table(): array
    {
        return self::$table ??= json_decode((string) file_get_contents(database_path('data/magic-role-effects.json')), true)['roles'];
    }
}

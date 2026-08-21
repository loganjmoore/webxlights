<?php

namespace App\Services\Shader;

/**
 * One completion, from whichever provider the operator pointed this at.
 *
 * The interface is this small because that is genuinely all shader generation needs: a system
 * prompt, a question, and the text that comes back. No tools, no streaming, no multi-turn - so
 * the surface a new provider has to implement is one method, and the prompt engineering that
 * makes the shaders good is shared by all of them rather than reimplemented per provider.
 */
interface GeneratorDriver
{
    /**
     * @param  string|null  $key  the caller's own key, when they brought one; else the server's
     * @return array{text: string, usage: array}
     */
    public function complete(string $system, string $user, string $model, ?string $key): array;

    /** Whether this driver can run at all - i.e. whether there is a key to use. */
    public function configured(?string $key): bool;
}

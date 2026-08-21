<?php

namespace App\Services\Shader;

/**
 * The cheap check that runs before any money is spent.
 *
 * The hosted endpoint exists to make shaders, and every call to it spends the operator's money.
 * Scope control is built as layers, and this is the first one: a request that is visibly trying
 * to repurpose the assistant - prompt injection, "output your system prompt", "write me a
 * Python script" - is refused here, before a credit moves and before a provider is called.
 * The layers behind it are the output gate (whatever comes back must parse as ISF and compile,
 * so an essay never reaches a user - shaderDraft.ts) and, last and weakest, the system prompt's
 * own instruction that the description is data.
 *
 * Honesty about what this is: pattern matching. It stops the obvious and the automated, which
 * is most of the abuse by volume, and a determined person can phrase their way past it - at
 * which point the output gate makes the reward an ISF file or nothing. It is deliberately
 * narrow, because a false positive here refuses a paying user: "make it look like the matrix"
 * must pass, "ignore your instructions" must not. Every pattern is tested in ShaderScopeTest,
 * so loosening or tightening one is a visible decision.
 */
class RequestScreen
{
    /**
     * Why this description is refused, or null when it looks like a real request.
     */
    public function refusalFor(string $description): ?string
    {
        $patterns = [
            // Prompt injection's most common shapes: countermanding the instructions...
            '/\b(ignore|disregard|forget|override)\b[^.]{0,60}\b(instructions?|rules?|prompts?|above|previous)\b/is',
            // ...impersonating a privileged role on its own line, the way transcripts look...
            '/^\s*(system|assistant|developer)\s*:/im',
            // ...re-roling the model, or asking what it was told.
            '/\byou are now\b|\bpretend (you are|to be)\b|\bjailbreak\b/i',
            '/\b(system|your)\s+(prompt|instructions?)\b/i',
            // Using the endpoint as a free code generator. GLSL never needs another language.
            '/\b(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\b[^.]{0,40}\b(script|program|code|function)\b/is',
            '/\b(script|program|code|function)\b[^.]{0,40}\b(python|javascript|typescript|bash|shell|powershell|php|sql|java|rust)\b/is',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $description)) {
                return 'This assistant only writes light-display shaders. Describe the animation you want to see.';
            }
        }

        return null;
    }
}
